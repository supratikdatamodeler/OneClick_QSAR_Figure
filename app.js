const state = {
  files: {},
  tables: {},
  generated: {},
  descriptors: [],
  target: "",
  intercept: 0,
  coefficients: {},
  stats: {},
  activeFigure: "scatter",
  svg: "",
  predictionFile: null,
  predictions: [],
  predictionSvg: "",
  predictionRankSvg: "",
  predictionCsv: "",
  settings: {
    scatter: { x: "Experimental pLC50", y: "Predicted pLC50", title: "" },
    williams: { x: "HAT value", y: "Standardized residuals", title: "" },
    randomization: { x: "R2", y: "Q2", title: "" },
    shap: { x: "SHAP value (impact on model output)", y: "", title: "" },
    correlation: { x: "", y: "", title: "" },
    loading: { x: "Factor 1", y: "Factor 2", title: "" },
    vip: { x: "Features", y: "VIP Score", title: "" },
    chemical: { x: "PC1", y: "PC2", title: "" },
    residuals: { x: "Prediction residual (Predicted - Experimental)", y: "Count", title: "" },
    contribution: { x: "", y: "", title: "" },
    outliers: { x: "", y: "", title: "" },
    global: {
      fontSize: 16,
      trainColor: "#4169e1",
      testColor: "#ff1f1f",
      lineColor: "#111111",
      accentColor: "#d62728",
      randomColor: "#34349b",
      chemicalColorMode: "class"
    }
  }
};

const exportUrls = [];

const fileInputs = {
  summary: "summaryFile",
  yrand: "yrandFile",
  trainAd: "trainAdFile",
  testAd: "testAdFile",
  trainLog: "trainLogFile",
  testLog: "testLogFile"
};

document.addEventListener("DOMContentLoaded", () => {
  Object.entries(fileInputs).forEach(([key, id]) => {
    document.getElementById(id).addEventListener("change", event => readInputFile(key, event.target.files[0]));
  });
  document.getElementById("generateBtn").addEventListener("click", generateWorkflow);
  document.getElementById("figureSelect").addEventListener("change", event => {
    saveSettingsFromForm();
    state.activeFigure = event.target.value;
    loadSettingsToForm();
    renderActiveFigure();
  });
  document.getElementById("chemicalColorMode").addEventListener("change", () => {
    saveSettingsFromForm();
    renderActiveFigure();
  });
  document.getElementById("applySettingsBtn").addEventListener("click", () => {
    saveSettingsFromForm();
    renderActiveFigure();
  });
  document.getElementById("applyPromptBtn").addEventListener("click", () => {
    applyPrompt(document.getElementById("promptBox").value);
    loadSettingsToForm();
    renderActiveFigure();
  });
  document.getElementById("downloadSvgBtn").addEventListener("click", downloadActiveSvg);
  document.getElementById("downloadPngBtn").addEventListener("click", downloadActivePng);
  document.getElementById("predictionFile").addEventListener("change", event => readPredictionFile(event.target.files[0]));
  document.getElementById("runPredictionBtn").addEventListener("click", runPredictionWorkflow);
  document.getElementById("predictionRankCount").addEventListener("change", () => {
    if (state.predictions.length) {
      state.predictionRankSvg = renderPredictionRankPlot();
      document.getElementById("predictionRankPlotArea").innerHTML = state.predictionRankSvg;
      renderPredictionTables();
      renderPredictionExportLinks();
    }
  });
  document.getElementById("downloadPredictionCsvBtn").addEventListener("click", downloadPredictionCsv);
  document.getElementById("downloadPredictionSvgBtn").addEventListener("click", downloadPredictionSvg);
  document.getElementById("downloadPredictionPngBtn").addEventListener("click", downloadPredictionPng);
  loadSettingsToForm();
});

function readInputFile(key, file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.files[key] = { name: file.name, text: String(reader.result || "") };
    setStatus(`${Object.keys(state.files).length} of 6 files loaded.`);
  };
  reader.readAsText(file);
}

function setStatus(message, isWarning = false) {
  const el = document.getElementById("status");
  el.textContent = message;
  el.className = isWarning ? "status warning" : "status";
}

function setPredictionStatus(message, isWarning = false) {
  const el = document.getElementById("predictionStatus");
  el.textContent = message;
  el.className = isWarning ? "status warning" : "status";
}

function readPredictionFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.predictionFile = { name: file.name, text: String(reader.result || "") };
    setPredictionStatus(`${file.name} loaded. Click Predict compounds.`);
  };
  reader.readAsText(file);
}

function generateWorkflow() {
  try {
    const missing = Object.keys(fileInputs).filter(key => !state.files[key]);
    if (missing.length) {
      setStatus(`Missing files: ${missing.join(", ")}.`, true);
      return;
    }

    state.tables.trainAd = typedRows(parseCSV(state.files.trainAd.text));
    state.tables.testAd = typedRows(parseCSV(state.files.testAd.text));
    state.tables.trainLog = typedRows(parseCSV(state.files.trainLog.text));
    state.tables.testLog = typedRows(parseCSV(state.files.testLog.text));
    state.tables.yrand = typedRows(parseCSV(state.files.yrand.text));

    state.target = detectTargetColumn(state.tables.trainAd.columns);
    state.descriptors = detectDescriptors(state.tables.trainAd.columns, state.target);
    state.intercept = parseIntercept(state.files.summary.text, state.target);
    state.coefficients = parseCoefficients(state.files.summary.text, state.descriptors);

    const scatter = buildScatter();
    const randomization = buildRandomization();
    const shap = buildShapTable();
    const williams = buildWilliams();

    state.generated = {
      "scatter_plot.csv": scatter.rows,
      "Randomization.csv": randomization.rows,
      "SHAP.csv": shap.rows,
      "williams_plot_initial.csv": williams.initialRows,
      "williams_plot_final.csv": williams.finalRows
    };

    state.stats = {
      trainCount: state.tables.trainAd.rows.length,
      testCount: state.tables.testAd.rows.length,
      descriptorCount: state.descriptors.length,
      hStar: williams.hStar,
      randomCount: randomization.rows.length - 1
    };

    renderMetrics();
    renderDownloads();
    document.getElementById("downloadSvgBtn").disabled = false;
    document.getElementById("downloadPngBtn").disabled = false;
    setStatus("Generated five CSV tables and all figure data.");
    renderActiveFigure();
  } catch (error) {
    console.error(error);
    setStatus(error.message || String(error), true);
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(value => String(value).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some(value => String(value).trim() !== "")) rows.push(row);
  if (!rows.length) throw new Error("CSV file is empty.");
  const columns = rows[0].map((name, index) => name.trim() || `blank_${index}`);
  const data = rows.slice(1).map(values => {
    const obj = {};
    columns.forEach((col, index) => {
      obj[col] = values[index] === undefined ? "" : values[index].trim();
    });
    return obj;
  });
  return { columns, rows: data };
}

function typedRows(table) {
  return {
    columns: table.columns,
    rows: table.rows.map(row => {
      const out = {};
      table.columns.forEach(col => {
        out[col] = toNumberIfPossible(row[col]);
      });
      return out;
    })
  };
}

function toNumberIfPossible(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "-") return trimmed;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : value;
}

function detectTargetColumn(columns) {
  const target = columns.find(col => /plc|activity|response|yobs/i.test(col));
  if (!target) throw new Error("Could not identify the response column in the StdAD file.");
  return target;
}

function detectDescriptors(columns, target) {
  return columns.filter(col => {
    if (col === target) return false;
    if (/^id$/i.test(col)) return false;
    if (/info|class|outlier|ad\s*info/i.test(col)) return false;
    return true;
  });
}

function parseIntercept(text, target) {
  const lines = String(text || "").split(/\r?\n/);
  const equationLine = lines.find(line => line.includes("=") && (!target || line.includes(target))) || lines.find(line => line.includes("=")) || "";
  const afterEquals = equationLine.split("=").slice(1).join("=");
  const match = afterEquals.match(/([+-]?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function parseCoefficients(text, descriptors) {
  const result = {};
  descriptors.forEach(desc => {
    const escaped = escapeRegExp(desc);
    const regex = new RegExp(`([+-]?\\d+(?:\\.\\d+)?(?:[Ee][+-]?\\d+)?)\\s*\\(\\+/-[^)]*\\)\\s*${escaped}`, "i");
    const match = text.match(regex);
    result[desc] = match ? Number(match[1]) : 1;
  });
  return result;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findColumn(columns, patterns) {
  return columns.find(col => patterns.some(pattern => pattern.test(col)));
}

function buildScatter() {
  const trainObs = findColumn(state.tables.trainLog.columns, [/^YObs/i]);
  const trainPred = findColumn(state.tables.trainLog.columns, [/^YPred\(MLR/i, /^YPred/i]);
  const testObs = findColumn(state.tables.testLog.columns, [/^YObs/i]);
  const testPred = findColumn(state.tables.testLog.columns, [/^YPred\(Test\)/i, /^YPred/i]);
  if (!trainObs || !trainPred || !testObs || !testPred) throw new Error("Could not identify observed/predicted columns in CalcLog files.");
  const rows = [];
  state.tables.trainLog.rows.forEach(row => rows.push({
    "Experimental pLC50": Number(row[trainObs]),
    "Predicted pLC50": Number(row[trainPred]),
    "Class": "Training set",
    "ID": row.ID
  }));
  state.tables.testLog.rows.forEach(row => rows.push({
    "Experimental pLC50": Number(row[testObs]),
    "Predicted pLC50": Number(row[testPred]),
    "Class": "Test set",
    "ID": row.ID
  }));
  return { rows };
}

function buildRandomization() {
  const r2 = findColumn(state.tables.yrand.columns, [/R\^2/i]);
  const q2 = findColumn(state.tables.yrand.columns, [/Q\^2/i]);
  const model = findColumn(state.tables.yrand.columns, [/model/i]) || state.tables.yrand.columns[0];
  if (!r2 || !q2) throw new Error("Could not identify R2/Q2 columns in Y-randomization file.");
  return {
    rows: state.tables.yrand.rows.map(row => ({
      "MODEL TYPE": row[model],
      "R2": Number(row[r2]),
      "Q2": Number(row[q2])
    }))
  };
}

function buildShapTable() {
  return {
    rows: state.tables.trainAd.rows.map(row => {
      const out = {};
      state.descriptors.forEach(desc => {
        out[desc] = Number(row[desc]);
      });
      out[state.target] = Number(row[state.target]);
      return out;
    })
  };
}

function buildWilliams() {
  const trainObs = findColumn(state.tables.trainLog.columns, [/^YObs/i]);
  const trainPred = findColumn(state.tables.trainLog.columns, [/^YPred\(MLR/i, /^YPred/i]);
  const trainResSq = findColumn(state.tables.trainLog.columns, [/\(Residual\)\^2\[MLR\]/i]);
  const testObs = findColumn(state.tables.testLog.columns, [/^YObs/i]);
  const testPred = findColumn(state.tables.testLog.columns, [/^YPred\(Test\)/i, /^YPred/i]);
  if (!trainObs || !trainPred || !testObs || !testPred) throw new Error("Could not identify CalcLog columns for Williams plot.");

  const trainX = state.tables.trainAd.rows.map(row => [1, ...state.descriptors.map(desc => Number(row[desc]))]);
  const testX = state.tables.testAd.rows.map(row => [1, ...state.descriptors.map(desc => Number(row[desc]))]);
  const leverageBasis = [...trainX, ...testX];
  const xtxInv = inverse(multiply(transpose(leverageBasis), leverageBasis));
  const leveragesTrain = trainX.map(row => leverage(row, xtxInv));
  const leveragesTest = testX.map(row => leverage(row, xtxInv));
  const p = state.descriptors.length;
  const n = state.tables.trainLog.rows.length;
  const sse = trainResSq
    ? sum(state.tables.trainLog.rows.map(row => Number(row[trainResSq])))
    : sum(state.tables.trainLog.rows.map(row => Math.pow(Number(row[trainObs]) - Number(row[trainPred]), 2)));
  const see = Math.sqrt(sse / Math.max(1, n - p - 1));
  const hStar = (3 * (p + 1)) / Math.max(1, n);

  const initialRows = [];
  const finalRows = [];
  state.tables.trainAd.rows.forEach((row, index) => {
    const log = state.tables.trainLog.rows[index] || {};
    const residual = Number(log[trainObs]) - Number(log[trainPred]);
    const std = residual / (see * Math.sqrt(Math.max(0.0001, 1 - leveragesTrain[index])));
    const out = makeWilliamsInitialRow(row, log[trainPred], residual, std, leveragesTrain[index], "Training set");
    initialRows.push(out);
    finalRows.push({ "std resi": round(std, 6), "Leverage": round(leveragesTrain[index], 6), "Class": "Training set" });
  });
  state.tables.testAd.rows.forEach((row, index) => {
    const log = state.tables.testLog.rows[index] || {};
    const residual = Number(log[testObs]) - Number(log[testPred]);
    const std = residual / (see * Math.sqrt(Math.max(0.0001, 1 + leveragesTest[index])));
    const out = makeWilliamsInitialRow(row, log[testPred], residual, std, leveragesTest[index], "Test set");
    initialRows.push(out);
    finalRows.push({ "std resi": round(std, 6), "Leverage": round(leveragesTest[index], 6), "Class": "Test set" });
  });
  return { initialRows, finalRows, hStar };
}

function makeWilliamsInitialRow(row, predicted, residual, std, leverageValue, className) {
  const out = {};
  if ("ID" in row) out.ID = row.ID;
  state.descriptors.forEach(desc => out[desc] = row[desc]);
  out[state.target] = row[state.target];
  out["YPred(MLR model)"] = round(Number(predicted), 9);
  out.residuals = round(residual, 9);
  out["std residuals"] = round(std, 6);
  out.Leverage = round(leverageValue, 6);
  out.Class = className;
  return out;
}

function renderMetrics() {
  const rows = [
    ["Training compounds", state.stats.trainCount],
    ["Test compounds", state.stats.testCount],
    ["Descriptors", state.stats.descriptorCount],
    ["Warning leverage h*", round(state.stats.hStar, 4)]
  ];
  document.getElementById("metrics").innerHTML = rows.map(([label, value]) => (
    `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
  )).join("");
}

function renderDownloads() {
  const container = document.getElementById("csvDownloads");
  container.innerHTML = "";
  Object.entries(state.generated).forEach(([name, rows]) => {
    const csv = toCSV(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const item = document.createElement("div");
    item.className = "download-item";
    const label = document.createElement("code");
    label.textContent = name;
    const actions = document.createElement("div");
    actions.className = "download-actions";
    const saveLink = document.createElement("a");
    saveLink.href = url;
    saveLink.download = name;
    saveLink.textContent = "Save";
    const openLink = document.createElement("a");
    openLink.href = url;
    openLink.target = "_blank";
    openLink.rel = "noopener";
    openLink.textContent = "Open";
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "secondary compact";
    copyButton.textContent = "Copy CSV";
    copyButton.addEventListener("click", () => copyCsvToClipboard(name, csv));
    const folderButton = document.createElement("button");
    folderButton.type = "button";
    folderButton.className = "secondary compact";
    folderButton.textContent = "Save folder";
    folderButton.addEventListener("click", () => saveTextExportToServer(name, csv, setStatus));
    actions.append(saveLink, openLink, copyButton, folderButton);
    item.append(label, actions);
    container.appendChild(item);
  });
}

async function copyCsvToClipboard(name, csv) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(csv);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = csv;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setStatus(`${name} copied to clipboard. Paste it into Excel or Notepad if browser download is blocked.`);
  } catch (error) {
    console.error(error);
    setStatus(`Could not copy ${name}. Use the Open link and save from the browser tab.`, true);
  }
}

function renderActiveFigure() {
  if (!Object.keys(state.generated).length) return;
  const fig = state.activeFigure;
  const title = document.getElementById("activeFigureTitle");
  const hint = document.getElementById("activeFigureHint");
  const names = {
    scatter: "Observed vs predicted",
    williams: "Williams plot",
    randomization: "Y-randomization",
    shap: "SHAP-style interpretation",
    correlation: "Correlation heatmap",
    loading: "Factor loading plot",
    vip: "VIP plot",
    chemical: "Chemical space PCA",
    residuals: "Residual distribution",
    contribution: "Descriptor contribution table",
    outliers: "Applicability-domain outlier table"
  };
  title.textContent = names[fig];
  hint.textContent = "Use the controls at left to edit labels, title, colors, and font size.";
  const renderers = {
    scatter: renderScatter,
    williams: renderWilliams,
    randomization: renderRandomization,
    shap: renderShap,
    correlation: renderCorrelation,
    loading: renderLoading,
    vip: renderVip,
    chemical: renderChemicalSpace,
    residuals: renderResidualDistribution,
    contribution: renderContributionTable,
    outliers: renderOutlierTable
  };
  state.svg = renderers[fig]();
  document.getElementById("figureArea").innerHTML = state.svg;
  renderFigureInfo(fig);
  clearExportLinks();
}

function chartBase(width = 1100, height = 760) {
  const fs = state.settings.global.fontSize;
  return { width, height, fs, margin: { top: 70, right: 90, bottom: 115, left: 120 } };
}

function getSetting(key) {
  return state.settings[state.activeFigure][key] || "";
}

function renderScatter() {
  const rows = state.generated["scatter_plot.csv"];
  const cfg = chartBase(1100, 820);
  const xs = rows.map(r => r["Experimental pLC50"]);
  const ys = rows.map(r => r["Predicted pLC50"]);
  const minValue = Math.floor(Math.min(...xs, ...ys) - 0.2);
  const maxValue = Math.ceil(Math.max(...xs, ...ys) + 0.2);
  const x = scaleLinear(minValue, maxValue, cfg.margin.left, cfg.width - cfg.margin.right);
  const y = scaleLinear(minValue, maxValue, cfg.height - cfg.margin.bottom, cfg.margin.top);
  let svg = svgOpen(cfg);
  svg += axes(cfg, x, y, minValue, maxValue, minValue, maxValue, getSetting("x"), getSetting("y"));
  svg += line(x(minValue), y(minValue), x(maxValue), y(maxValue), state.settings.global.lineColor, 5, "8 8");
  rows.forEach(row => {
    const isTrain = row.Class === "Training set";
    svg += marker(x(row["Experimental pLC50"]), y(row["Predicted pLC50"]), isTrain ? "circle" : "triangle", isTrain ? state.settings.global.trainColor : state.settings.global.testColor, 10);
  });
  svg += legend(cfg.margin.left + 25, cfg.margin.top + 45, [
    ["Training set", state.settings.global.trainColor, "circle"],
    ["Test set", state.settings.global.testColor, "triangle"]
  ], cfg.fs);
  svg += plotTitle(cfg, getSetting("title"));
  return svg + "</svg>";
}

function renderWilliams() {
  const rows = state.generated["williams_plot_final.csv"];
  const cfg = chartBase(1100, 820);
  const maxLev = Math.max(1, state.stats.hStar * 1.4, ...rows.map(r => r.Leverage)) * 1.05;
  const x = scaleLinear(0, maxLev, cfg.margin.left, cfg.width - cfg.margin.right);
  const y = scaleLinear(-4, 4, cfg.height - cfg.margin.bottom, cfg.margin.top);
  let svg = svgOpen(cfg);
  svg += axes(cfg, x, y, 0, maxLev, -4, 4, getSetting("x"), getSetting("y"));
  svg += line(x(0), y(3), x(maxLev), y(3), "#1f77b4", 4, "10 8");
  svg += line(x(0), y(-3), x(maxLev), y(-3), "#1f77b4", 4, "10 8");
  svg += line(x(state.stats.hStar), y(-4), x(state.stats.hStar), y(4), state.settings.global.testColor, 4, "10 8");
  rows.forEach(row => {
    const isTrain = row.Class === "Training set";
    svg += marker(x(row.Leverage), y(row["std resi"]), isTrain ? "circle" : "triangle", isTrain ? state.settings.global.trainColor : state.settings.global.testColor, 9);
  });
  svg += legend(cfg.width - 340, cfg.margin.top + 330, [
    ["Training set", state.settings.global.trainColor, "circle"],
    ["Test set", state.settings.global.testColor, "triangle"]
  ], cfg.fs);
  svg += plotTitle(cfg, getSetting("title"));
  return svg + "</svg>";
}

function renderRandomization() {
  const rows = state.generated["Randomization.csv"];
  const cfg = chartBase(980, 650);
  const xs = rows.map(r => r.R2);
  const ys = rows.map(r => r.Q2);
  const xMin = Math.min(-0.02, Math.floor(Math.min(...xs) * 10) / 10);
  const xMax = Math.max(0.8, Math.ceil(Math.max(...xs) * 10) / 10);
  const yMin = Math.min(-0.5, Math.floor(Math.min(...ys) * 10) / 10);
  const yMax = Math.max(0.8, Math.ceil(Math.max(...ys) * 10) / 10);
  const x = scaleLinear(xMin, xMax, cfg.margin.left, cfg.width - cfg.margin.right);
  const y = scaleLinear(yMin, yMax, cfg.height - cfg.margin.bottom, cfg.margin.top);
  let svg = svgOpen(cfg);
  svg += axes(cfg, x, y, xMin, xMax, yMin, yMax, getSetting("x"), getSetting("y"));
  svg += line(x(xMin), y(0), x(xMax), y(0), "#555555", 1.5, "");
  svg += line(x(0), y(yMin), x(0), y(yMax), "#555555", 1.5, "");
  rows.forEach(row => {
    const original = /original/i.test(String(row["MODEL TYPE"]));
    svg += marker(x(row.R2), y(row.Q2), original ? "x" : "circle", original ? state.settings.global.accentColor : state.settings.global.randomColor, original ? 14 : 6);
  });
  svg += legend(cfg.width - 310, cfg.height - 190, [
    ["Y-scrambled", state.settings.global.randomColor, "circle"],
    ["Original Model", state.settings.global.accentColor, "x"]
  ], cfg.fs);
  svg += plotTitle(cfg, getSetting("title"));
  return svg + "</svg>";
}

function renderShap() {
  const shapRows = state.generated["SHAP.csv"];
  const features = state.descriptors.map(desc => {
    const values = shapRows.map(row => Number(row[desc]));
    const mean = average(values);
    const contrib = values.map(value => state.coefficients[desc] * (value - mean));
    return { desc, values, contrib, meanAbs: average(contrib.map(Math.abs)) };
  }).sort((a, b) => b.meanAbs - a.meanAbs);
  const all = features.flatMap(f => f.contrib);
  const cfg = chartBase(1200, Math.max(620, 135 + features.length * 85));
  cfg.margin.left = 250;
  cfg.margin.right = 170;
  const minX = Math.min(...all, -0.1);
  const maxX = Math.max(...all, 0.1);
  const pad = (maxX - minX) * 0.12;
  const x = scaleLinear(minX - pad, maxX + pad, cfg.margin.left, cfg.width - cfg.margin.right);
  const yStep = (cfg.height - cfg.margin.top - cfg.margin.bottom) / Math.max(1, features.length - 1);
  let svg = svgOpen(cfg);
  svg += `<line x1="${x(0)}" y1="${cfg.margin.top - 25}" x2="${x(0)}" y2="${cfg.height - cfg.margin.bottom + 25}" stroke="#777" stroke-width="4"/>`;
  features.forEach((feature, i) => {
    const yBase = cfg.margin.top + i * yStep;
    svg += `<line x1="${cfg.margin.left}" y1="${yBase}" x2="${cfg.width - cfg.margin.right}" y2="${yBase}" stroke="#d7d7d7" stroke-width="2" stroke-dasharray="2 9"/>`;
    svg += text(cfg.margin.left - 45, yBase + 6, feature.desc, cfg.fs * 1.1, "end", "#222", 700);
    const minVal = Math.min(...feature.values);
    const maxVal = Math.max(...feature.values);
    feature.contrib.forEach((value, j) => {
      const normalized = (feature.values[j] - minVal) / Math.max(0.000001, maxVal - minVal);
      const color = colorRamp(normalized);
      const jitter = (((j * 37) % 17) - 8) * 1.8;
      svg += `<circle cx="${x(value)}" cy="${yBase + jitter}" r="6" fill="${color}" opacity="0.88"/>`;
    });
  });
  const bottom = cfg.height - cfg.margin.bottom;
  svg += axisBottom(cfg, x, minX - pad, maxX + pad, bottom, getSetting("x"));
  svg += colorBar(cfg.width - 105, cfg.margin.top, cfg.height - cfg.margin.bottom, cfg.fs);
  svg += plotTitle(cfg, getSetting("title"));
  return svg + "</svg>";
}

function renderCorrelation() {
  const rows = state.generated["SHAP.csv"];
  const labels = [...state.descriptors, state.target];
  const matrix = labels.map(a => labels.map(b => correlation(rows.map(r => Number(r[a])), rows.map(r => Number(r[b])))));
  const cfg = chartBase(950, 760);
  cfg.margin.left = 210;
  cfg.margin.bottom = 250;
  cfg.margin.right = 120;
  const size = Math.min((cfg.width - cfg.margin.left - cfg.margin.right) / labels.length, (cfg.height - cfg.margin.top - cfg.margin.bottom) / labels.length);
  let svg = svgOpen(cfg);
  for (let i = 1; i < labels.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const value = matrix[i][j];
      const xx = cfg.margin.left + j * size;
      const yy = cfg.margin.top + i * size;
      svg += `<rect x="${xx}" y="${yy}" width="${size}" height="${size}" fill="${corrColor(value)}" stroke="#fff"/>`;
      svg += text(xx + size / 2, yy + size / 2 + 5, round(value, 2), cfg.fs, "middle", Math.abs(value) > 0.55 ? "#ffffff" : "#222222", 500);
    }
  }
  labels.forEach((label, i) => {
    svg += rotatedTextStart(cfg.margin.left + i * size + size / 2 - 5, cfg.margin.top + labels.length * size + 28, label, cfg.fs * 0.88, 45);
    svg += text(cfg.margin.left - 10, cfg.margin.top + i * size + size / 2 + 5, label, cfg.fs * 0.88, "end", "#222", 700);
  });
  svg += correlationLegend(cfg.width - 85, cfg.margin.top + 20, 220, cfg.fs);
  svg += plotTitle(cfg, getSetting("title"));
  return svg + "</svg>";
}

function renderLoading() {
  const rows = state.generated["SHAP.csv"];
  const points = buildPlsLoadingPoints(rows);
  const maxAbs = Math.max(0.2, ...points.flatMap(p => [Math.abs(p.x), Math.abs(p.y)])) * 1.15;
  const cfg = chartBase(950, 700);
  const x = scaleLinear(-maxAbs, maxAbs, cfg.margin.left, cfg.width - cfg.margin.right);
  const y = scaleLinear(-maxAbs, maxAbs, cfg.height - cfg.margin.bottom, cfg.margin.top);
  let svg = svgOpen(cfg);
  svg += axes(cfg, x, y, -maxAbs, maxAbs, -maxAbs, maxAbs, getSetting("x"), getSetting("y"));
  svg += line(x(0), y(-maxAbs), x(0), y(maxAbs), "#222", 1.5, "");
  svg += line(x(-maxAbs), y(0), x(maxAbs), y(0), "#222", 1.5, "");
  points.forEach(point => {
    const color = point.target ? state.settings.global.testColor : state.settings.global.randomColor;
    svg += marker(x(point.x), y(point.y), point.target ? "circle" : "circle", color, point.target ? 9 : 6);
    svg += text(x(point.x) + 8, y(point.y) - 6, point.label, cfg.fs * 0.84, "start", color, point.target ? 700 : 600);
  });
  svg += legend(cfg.width - 300, cfg.margin.top, [
    ["Descriptors", state.settings.global.randomColor, "circle"],
    [state.target, state.settings.global.testColor, "circle"]
  ], cfg.fs);
  svg += plotTitle(cfg, getSetting("title"));
  return svg + "</svg>";
}

function renderVip() {
  const rows = state.generated["SHAP.csv"];
  const yValues = rows.map(row => Number(row[state.target]));
  const ySd = std(yValues) || 1;
  const raw = state.descriptors.map(desc => {
    const values = rows.map(row => Number(row[desc]));
    const score = Math.abs((state.coefficients[desc] || 1) * (std(values) || 1) / ySd);
    return { desc, raw: score };
  });
  const denom = Math.sqrt(sum(raw.map(item => item.raw * item.raw)) / Math.max(1, raw.length)) || 1;
  const vip = raw.map(item => ({ desc: item.desc, score: item.raw / denom })).sort((a, b) => b.score - a.score);
  const cfg = chartBase(1050, 680);
  cfg.margin.left = 110;
  cfg.margin.bottom = 250;
  const maxScore = Math.max(1.2, ...vip.map(d => d.score)) * 1.1;
  const x0 = cfg.margin.left;
  const x1 = cfg.width - cfg.margin.right;
  const y = scaleLinear(0, maxScore, cfg.height - cfg.margin.bottom, cfg.margin.top);
  const band = (x1 - x0) / vip.length;
  let svg = svgOpen(cfg);
  svg += axisLeft(cfg, y, 0, maxScore, getSetting("y"));
  svg += axisLabelBottom(cfg, getSetting("x"));
  vip.forEach((item, i) => {
    const barW = band * 0.72;
    const xx = x0 + i * band + (band - barW) / 2;
    const yy = y(item.score);
    svg += `<rect x="${xx}" y="${yy}" width="${barW}" height="${cfg.height - cfg.margin.bottom - yy}" fill="${state.settings.global.trainColor}"/>`;
    svg += wrappedCenteredText(x0 + i * band + band / 2, cfg.height - cfg.margin.bottom + 32, item.desc, cfg.fs * 0.78, Math.max(8, Math.floor(band / 8)), 4);
  });
  svg += plotTitle(cfg, getSetting("title"));
  return svg + "</svg>";
}

function renderChemicalSpace() {
  const data = buildChemicalSpaceData();
  const cfg = chartBase(1050, 760);
  cfg.margin.left = 125;
  cfg.margin.right = 170;
  const xVals = data.points.map(point => point.pc1);
  const yVals = data.points.map(point => point.pc2);
  const xPad = (Math.max(...xVals) - Math.min(...xVals) || 1) * 0.12;
  const yPad = (Math.max(...yVals) - Math.min(...yVals) || 1) * 0.12;
  const xMin = Math.min(...xVals) - xPad;
  const xMax = Math.max(...xVals) + xPad;
  const yMin = Math.min(...yVals) - yPad;
  const yMax = Math.max(...yVals) + yPad;
  const x = scaleLinear(xMin, xMax, cfg.margin.left, cfg.width - cfg.margin.right);
  const y = scaleLinear(yMin, yMax, cfg.height - cfg.margin.bottom, cfg.margin.top);
  let svg = svgOpen(cfg);
  svg += axes(
    cfg,
    x,
    y,
    xMin,
    xMax,
    yMin,
    yMax,
    `${getSetting("x")} (${round(data.variance[0] * 100, 1)}%)`,
    `${getSetting("y")} (${round(data.variance[1] * 100, 1)}%)`
  );
  svg += line(x(0), y(yMin), x(0), y(yMax), "#888", 1.2, "5 8");
  svg += line(x(xMin), y(0), x(xMax), y(0), "#888", 1.2, "5 8");
  const colorMode = state.settings.global.chemicalColorMode;
  data.points.forEach(point => {
    const color = chemicalPointColor(point, colorMode);
    svg += marker(x(point.pc1), y(point.pc2), point.className === "Training set" ? "circle" : "triangle", color, 7);
  });
  const legendItems = colorMode === "ad"
    ? [["Inside AD", "#2ca25f", "circle"], ["Outside AD", state.settings.global.accentColor, "circle"]]
    : [["Training set", state.settings.global.trainColor, "circle"], ["Test set", state.settings.global.testColor, "triangle"]];
  svg += legend(cfg.width - 265, cfg.margin.top + 10, legendItems, cfg.fs);
  svg += plotTitle(cfg, getSetting("title"));
  return svg + "</svg>";
}

function renderResidualDistribution() {
  const rows = state.generated["scatter_plot.csv"].map(row => ({
    className: row.Class,
    residual: Number(row["Predicted pLC50"]) - Number(row["Experimental pLC50"])
  }));
  const values = rows.map(row => row.residual);
  const maxAbs = Math.max(0.5, ...values.map(Math.abs)) * 1.05;
  const bins = 18;
  const minValue = -maxAbs;
  const maxValue = maxAbs;
  const binWidth = (maxValue - minValue) / bins;
  const trainCounts = Array(bins).fill(0);
  const testCounts = Array(bins).fill(0);
  rows.forEach(row => {
    const index = clamp(Math.floor((row.residual - minValue) / binWidth), 0, bins - 1);
    if (row.className === "Training set") trainCounts[index] += 1;
    else testCounts[index] += 1;
  });
  const maxCount = Math.max(1, ...trainCounts, ...testCounts);
  const cfg = chartBase(1050, 700);
  const x = scaleLinear(minValue, maxValue, cfg.margin.left, cfg.width - cfg.margin.right);
  const y = scaleLinear(0, maxCount, cfg.height - cfg.margin.bottom, cfg.margin.top);
  let svg = svgOpen(cfg);
  svg += axes(cfg, x, y, minValue, maxValue, 0, maxCount, getSetting("x"), getSetting("y"));
  svg += line(x(0), y(0), x(0), y(maxCount), state.settings.global.lineColor, 3, "8 7");
  for (let i = 0; i < bins; i += 1) {
    const x0 = x(minValue + i * binWidth);
    const x1 = x(minValue + (i + 1) * binWidth);
    const barW = Math.max(1, x1 - x0 - 2);
    const half = barW / 2;
    svg += `<rect x="${x0 + 1}" y="${y(trainCounts[i])}" width="${half}" height="${y(0) - y(trainCounts[i])}" fill="${state.settings.global.trainColor}" opacity="0.78"/>`;
    svg += `<rect x="${x0 + 1 + half}" y="${y(testCounts[i])}" width="${half}" height="${y(0) - y(testCounts[i])}" fill="${state.settings.global.testColor}" opacity="0.78"/>`;
  }
  svg += legend(cfg.width - 300, cfg.margin.top + 20, [
    ["Training set", state.settings.global.trainColor, "circle"],
    ["Test set", state.settings.global.testColor, "triangle"]
  ], cfg.fs);
  svg += plotTitle(cfg, getSetting("title"));
  return svg + "</svg>";
}

function renderContributionTable() {
  const rows = buildDescriptorContributionRows();
  const cfg = { width: 1300, height: 140 + rows.length * 62, fs: state.settings.global.fontSize };
  const columns = [
    { key: "descriptor", label: "Descriptor", x: 45, width: 300 },
    { key: "sign", label: "Coefficient sign", x: 345, width: 190 },
    { key: "vip", label: "VIP", x: 535, width: 120 },
    { key: "corr", label: `r with ${state.target}`, x: 655, width: 160 },
    { key: "interpretation", label: "Model interpretation", x: 815, width: 440 }
  ];
  let svg = svgOpen(cfg);
  svg += tableTitle(cfg, getSetting("title") || "Descriptor contribution summary");
  svg += tableHeader(columns, 80, cfg.fs);
  rows.forEach((row, i) => {
    const y = 118 + i * 62;
    svg += `<rect x="35" y="${y - 28}" width="1225" height="60" fill="${i % 2 ? "#f7f8fa" : "#ffffff"}" stroke="#d7dde5"/>`;
    columns.forEach(col => {
      const value = col.key === "vip" || col.key === "corr" ? round(row[col.key], 3) : row[col.key];
      svg += svgWrappedCell(col.x + 8, y - 5, value, cfg.fs * 0.84, Math.floor(col.width / 8.4), 3, col.key === "sign" ? row.color : "#111");
    });
  });
  return svg + "</svg>";
}

function renderOutlierTable() {
  const rows = buildOutlierRows();
  const cfg = { width: 1200, height: 145 + Math.max(1, rows.length) * 58, fs: state.settings.global.fontSize };
  const columns = [
    { key: "id", label: "ID", x: 45, width: 110 },
    { key: "className", label: "Set", x: 155, width: 175 },
    { key: "leverage", label: "Leverage", x: 330, width: 150 },
    { key: "stdResidual", label: "Std residual", x: 480, width: 165 },
    { key: "flag", label: "AD diagnostic flag", x: 645, width: 500 }
  ];
  let svg = svgOpen(cfg);
  svg += tableTitle(cfg, getSetting("title") || "Applicability-domain diagnostic compounds");
  svg += tableHeader(columns, 80, cfg.fs);
  rows.forEach((row, i) => {
    const y = 118 + i * 58;
    svg += `<rect x="35" y="${y - 28}" width="1125" height="56" fill="${i % 2 ? "#f7f8fa" : "#ffffff"}" stroke="#d7dde5"/>`;
    columns.forEach(col => {
      const value = col.key === "leverage" || col.key === "stdResidual" ? round(row[col.key], 3) : row[col.key];
      svg += svgWrappedCell(col.x + 8, y - 4, value, cfg.fs * 0.84, Math.floor(col.width / 8.4), 3, col.key === "flag" ? row.color : "#111");
    });
  });
  return svg + "</svg>";
}

function runPredictionWorkflow() {
  try {
    if (!Object.keys(state.generated).length) {
      setPredictionStatus("Generate the model files first, then run prediction.", true);
      return;
    }
    if (!state.predictionFile) {
      setPredictionStatus("Upload an external descriptor-space CSV first.", true);
      return;
    }
    const table = typedRows(parseCSV(state.predictionFile.text));
    const missing = state.descriptors.filter(desc => !table.columns.includes(desc));
    if (missing.length) {
      setPredictionStatus(`Prediction file is missing modeled descriptors: ${missing.join(", ")}.`, true);
      return;
    }
    const xtxInv = modelLeverageInverse();
    const infoColumns = table.columns.filter(col => !state.descriptors.includes(col));
    const nameColumn = detectNameColumn(table.columns);
    state.predictions = table.rows.map((row, index) => {
      const descriptorValues = state.descriptors.map(desc => Number(row[desc]));
      const predicted = state.intercept + sum(state.descriptors.map((desc, i) => (state.coefficients[desc] || 0) * descriptorValues[i]));
      const leverageValue = leverage([1, ...descriptorValues], xtxInv);
      const output = {};
      infoColumns.forEach(col => output[col] = row[col]);
      output.ID = output.ID ?? output.Id ?? output.id ?? index + 1;
      output._label = getPredictionLabel(row, nameColumn, index);
      output["Display name"] = output._label;
      output[`Predicted ${state.target}`] = round(predicted, 6);
      output.Leverage = round(leverageValue, 6);
      output["AD status"] = leverageValue <= state.stats.hStar ? "Inside AD" : "Outside AD";
      output._prediction = predicted;
      output._leverage = leverageValue;
      return output;
    });
    state.predictionCsv = toCSV(state.predictions.map(row => {
      const clean = { ...row };
      delete clean._prediction;
      delete clean._leverage;
      delete clean._label;
      return clean;
    }));
    state.predictionSvg = renderInsubriaPlot();
    state.predictionRankSvg = renderPredictionRankPlot();
    document.getElementById("predictionPlotArea").innerHTML = state.predictionSvg;
    document.getElementById("predictionRankPlotArea").innerHTML = state.predictionRankSvg;
    renderPredictionTables();
    document.getElementById("downloadPredictionCsvBtn").disabled = false;
    document.getElementById("downloadPredictionSvgBtn").disabled = false;
    document.getElementById("downloadPredictionPngBtn").disabled = false;
    clearPredictionExportLinks();
    renderPredictionExportLinks();
    setPredictionStatus(`Predicted ${state.predictions.length} external compounds and checked AD status.`);
  } catch (error) {
    console.error(error);
    setPredictionStatus(error.message || String(error), true);
  }
}

function modelLeverageInverse() {
  const trainX = state.tables.trainAd.rows.map(row => [1, ...state.descriptors.map(desc => Number(row[desc]))]);
  const testX = state.tables.testAd.rows.map(row => [1, ...state.descriptors.map(desc => Number(row[desc]))]);
  return inverse(multiply(transpose([...trainX, ...testX]), [...trainX, ...testX]));
}

function detectNameColumn(columns) {
  return columns.find(col => /^(name|compound|compound[_\s-]*name|chemical[_\s-]*name|molecule|molecule[_\s-]*name|title|label)$/i.test(col))
    || columns.find(col => /(compound|chemical|molecule).*name|name.*compound/i.test(col))
    || columns.find(col => /cas|inchikey|smiles/i.test(col))
    || columns.find(col => /^id$/i.test(col));
}

function getPredictionLabel(row, nameColumn, index) {
  const value = nameColumn ? row[nameColumn] : "";
  if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  const idValue = row.ID ?? row.Id ?? row.id;
  return idValue !== undefined && idValue !== null && String(idValue).trim() !== "" ? `ID ${idValue}` : `Compound ${index + 1}`;
}

function renderInsubriaPlot() {
  const finalRows = state.generated["williams_plot_final.csv"] || [];
  const initialRows = state.generated["williams_plot_initial.csv"] || [];
  const modelPoints = finalRows.map((row, index) => ({
    className: row.Class,
    leverage: Number(row.Leverage),
    prediction: Number(initialRows[index]?.["YPred(MLR model)"] ?? initialRows[index]?.[state.target] ?? 0)
  }));
  const externalPoints = state.predictions.map(row => ({
    className: "External prediction",
    leverage: row._leverage,
    prediction: row._prediction,
    adStatus: row["AD status"]
  }));
  const all = [...modelPoints, ...externalPoints];
  const cfg = chartBase(1050, 760);
  cfg.margin.left = 125;
  cfg.margin.right = 190;
  const xMax = Math.max(0.2, state.stats.hStar * 2.2, ...all.map(point => point.leverage)) * 1.08;
  const yValues = all.map(point => point.prediction).filter(Number.isFinite);
  const yMin = Math.min(0, Math.floor(Math.min(...yValues) - 0.5));
  const yMax = Math.ceil(Math.max(...yValues) + 0.5);
  const x = scaleLinear(0, xMax, cfg.margin.left, cfg.width - cfg.margin.right);
  const y = scaleLinear(yMin, yMax, cfg.height - cfg.margin.bottom, cfg.margin.top);
  let svg = svgOpen(cfg);
  svg += axes(cfg, x, y, 0, xMax, yMin, yMax, "HAT value", `Predicted ${state.target}`);
  svg += line(x(state.stats.hStar), y(yMin), x(state.stats.hStar), y(yMax), state.settings.global.accentColor, 4, "9 7");
  modelPoints.forEach(point => {
    const isTrain = point.className === "Training set";
    svg += marker(x(point.leverage), y(point.prediction), isTrain ? "circle" : "triangle", isTrain ? state.settings.global.trainColor : "#f2c94c", 7);
  });
  externalPoints.forEach(point => {
    const color = point.adStatus === "Inside AD" ? "#7fbf7b" : state.settings.global.accentColor;
    svg += marker(x(point.leverage), y(point.prediction), "square", color, 5.8);
  });
  svg += legend(cfg.width - 300, cfg.margin.top + 12, [
    ["Training Set", state.settings.global.trainColor, "circle"],
    ["External Prediction", "#7fbf7b", "square"],
    ["Test Set", "#f2c94c", "triangle"]
  ], cfg.fs * 0.88);
  svg += text(x(state.stats.hStar) + 8, cfg.margin.top + 18, `h* = ${round(state.stats.hStar, 3)}`, cfg.fs * 0.82, "start", state.settings.global.accentColor, 700);
  svg += plotTitle(cfg, "Insubria plot");
  return svg + "</svg>";
}

function renderPredictionRankPlot() {
  const count = getPredictionRankCount();
  const sorted = [...state.predictions].sort((a, b) => b._prediction - a._prediction);
  const top = sorted.slice(0, count);
  const least = sorted.slice(-count).reverse();
  const all = [...top, ...least];
  const maxValue = Math.max(1, ...all.map(row => row._prediction)) * 1.08;
  const minValue = Math.min(0, ...all.map(row => row._prediction));
  const cfg = {
    width: 1200,
    height: Math.max(720, 210 + count * 82),
    fs: state.settings.global.fontSize,
    margin: { top: 76, right: 100, bottom: 125, left: 300 }
  };
  const panelGap = 70;
  const panelHeight = (cfg.height - cfg.margin.top - cfg.margin.bottom - panelGap) / 2;
  const x = scaleLinear(minValue, maxValue, cfg.margin.left, cfg.width - cfg.margin.right);
  let svg = svgOpen(cfg);
  svg += plotTitle(cfg, "Top and least predicted compounds");
  svg += renderPredictionBarPanel(top, `Top ${count} predicted`, cfg.margin.top, panelHeight, x, maxValue, state.settings.global.accentColor, cfg);
  svg += renderPredictionBarPanel(least, `Least ${count} predicted`, cfg.margin.top + panelHeight + panelGap, panelHeight, x, maxValue, state.settings.global.trainColor, cfg);
  svg += rankAxisBottom(cfg, x, minValue, maxValue, `Predicted ${state.target}`);
  return svg + "</svg>";
}

function renderPredictionBarPanel(rows, titleValue, yTop, panelHeight, x, maxValue, color, cfg) {
  const rowGap = 8;
  const barHeight = Math.max(18, (panelHeight - rowGap * (rows.length - 1)) / Math.max(1, rows.length));
  let svg = text(cfg.margin.left, yTop - 16, titleValue, cfg.fs * 0.98, "start", "#111", 700);
  rows.forEach((row, i) => {
    const y = yTop + i * (barHeight + rowGap);
    const x0 = x(0);
    const x1 = x(row._prediction);
    const width = Math.max(2, x1 - x0);
    const labelValue = row._label || row["Display name"] || row.ID || "Compound";
    svg += text(cfg.margin.left - 12, y + barHeight * 0.68, truncateLabel(labelValue, 40), cfg.fs * 0.78, "end", "#111", 700);
    svg += `<rect x="${x0}" y="${y}" width="${width}" height="${barHeight}" fill="${color}" opacity="0.9"/>`;
    const valueX = Math.min(x1 + 8, cfg.width - cfg.margin.right - 45);
    svg += text(valueX, y + barHeight * 0.68, round(row._prediction, 3), cfg.fs * 0.72, "start", "#111", 700);
  });
  svg += line(cfg.margin.left, yTop + panelHeight + 16, cfg.width - cfg.margin.right, yTop + panelHeight + 16, "#d7dde5", 1, "");
  return svg;
}

function rankAxisBottom(cfg, scale, minValue, maxValue, label) {
  const yPos = cfg.height - cfg.margin.bottom + 26;
  let svg = line(cfg.margin.left, yPos, cfg.width - cfg.margin.right, yPos, "#111", 2, "");
  ticks(minValue, maxValue, 7).forEach(value => {
    const xx = scale(value);
    svg += line(xx, yPos, xx, yPos + 8, "#111", 2, "");
    svg += text(xx, yPos + 30, formatTick(value), cfg.fs * 0.82, "middle", "#111", 700);
  });
  svg += text(cfg.width / 2, cfg.height - 26, label, cfg.fs * 1.05, "middle", "#111", 700);
  return svg;
}

function truncateLabel(value, maxLength) {
  const textValue = String(value);
  return textValue.length > maxLength ? `${textValue.slice(0, maxLength - 3)}...` : textValue;
}

function getPredictionRankCount() {
  const input = document.getElementById("predictionRankCount");
  const requested = input ? Number(input.value) : 5;
  const maxAvailable = Math.max(1, Math.floor((state.predictions.length || 10) / 2));
  const count = clamp(Number.isFinite(requested) ? Math.round(requested) : 5, 1, Math.min(50, maxAvailable));
  if (input && Number(input.value) !== count) input.value = count;
  return count;
}

function renderPredictionTables() {
  const count = getPredictionRankCount();
  const sorted = [...state.predictions].sort((a, b) => b._prediction - a._prediction);
  document.getElementById("topPredictions").classList.remove("muted");
  document.getElementById("leastPredictions").classList.remove("muted");
  document.getElementById("topPredictionsTitle").textContent = `Top ${count} Predicted`;
  document.getElementById("leastPredictionsTitle").textContent = `Least ${count} Predicted`;
  document.getElementById("topPredictions").innerHTML = predictionRowsTable(sorted.slice(0, count));
  document.getElementById("leastPredictions").innerHTML = predictionRowsTable(sorted.slice(-count).reverse());
}

function predictionRowsTable(rows) {
  if (!rows.length) return "No predictions.";
  const predColumn = `Predicted ${state.target}`;
  return `<table>
    <thead><tr><th>Compound</th><th>${escapeHtml(predColumn)}</th><th>Leverage</th><th>AD</th></tr></thead>
    <tbody>${rows.map(row => `<tr>
      <td>${escapeHtml(row._label || row["Display name"] || row.ID)}</td>
      <td>${round(row[predColumn], 4)}</td>
      <td>${round(row.Leverage, 4)}</td>
      <td>${escapeHtml(row["AD status"])}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function downloadPredictionCsv() {
  if (!state.predictionCsv) return;
  offerPredictionExport("external_predictions.csv", new Blob([state.predictionCsv], { type: "text/csv;charset=utf-8" }), "Prediction CSV ready. If automatic download did not start, use this link:");
}

function downloadPredictionSvg() {
  if (!state.predictionSvg) return;
  offerPredictionExport("insubria_plot.svg", new Blob([state.predictionSvg], { type: "image/svg+xml;charset=utf-8" }), "Insubria SVG ready. If automatic download did not start, use this link:");
}

function downloadPredictionPng() {
  if (!state.predictionSvg) return;
  exportSvgToPng(state.predictionSvg, "insubria_plot.png", (name, blob) => {
    offerPredictionExport(name, blob, "Insubria PNG ready. If automatic download did not start, use this link:");
  });
}

function offerPredictionExport(name, blob, message) {
  const url = URL.createObjectURL(blob);
  exportUrls.push(url);
  const container = document.getElementById("predictionExportLinks");
  container.classList.add("is-visible");
  container.innerHTML = `<span>${escapeHtml(message)}</span>`;
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = `Save ${name}`;
  container.appendChild(link);
  saveBlobExportToServer(name, blob, setPredictionStatus);
  triggerDownload(name, url);
}

function renderPredictionExportLinks() {
  const container = document.getElementById("predictionExportLinks");
  container.classList.add("is-visible");
  container.innerHTML = "<span>Prediction exports:</span>";
  addPredictionExportGroup(container, "Predictions CSV", "external_predictions.csv", state.predictionCsv, "text/csv;charset=utf-8", true);
  addPredictionExportGroup(container, "Insubria SVG", "insubria_plot.svg", state.predictionSvg, "image/svg+xml;charset=utf-8", true);
  addPredictionExportGroup(container, "Top/least SVG", "top_least_predictions.svg", state.predictionRankSvg, "image/svg+xml;charset=utf-8", true);
}

function addPredictionExportGroup(container, label, fileName, content, mimeType, copyable) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  exportUrls.push(url);
  const group = document.createElement("span");
  group.className = "export-group";
  const labelEl = document.createElement("strong");
  labelEl.textContent = label;
  const save = document.createElement("a");
  save.href = url;
  save.download = fileName;
  save.textContent = "Save";
  const open = document.createElement("a");
  open.href = url;
  open.target = "_blank";
  open.rel = "noopener";
  open.textContent = "Open";
  group.append(labelEl, save, open);
  if (copyable) {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "secondary compact";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => copyPredictionText(fileName, content));
    group.appendChild(copy);
  }
  const folder = document.createElement("button");
  folder.type = "button";
  folder.className = "secondary compact";
  folder.textContent = "Save folder";
  folder.addEventListener("click", () => {
    if (mimeType.startsWith("text/") || mimeType.includes("svg")) {
      saveTextExportToServer(fileName, content, setPredictionStatus);
    } else {
      saveBlobExportToServer(fileName, blob, setPredictionStatus);
    }
  });
  group.appendChild(folder);
  container.appendChild(group);
}

async function copyPredictionText(name, textValue) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(textValue);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = textValue;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setPredictionStatus(`${name} copied to clipboard.`);
  } catch (error) {
    console.error(error);
    setPredictionStatus(`Could not copy ${name}. Use Open and save from the browser tab.`, true);
  }
}

function clearPredictionExportLinks() {
  const container = document.getElementById("predictionExportLinks");
  if (!container) return;
  container.classList.remove("is-visible");
  container.innerHTML = "";
}

function renderFigureInfo(fig) {
  const info = figureNarrative(fig);
  const container = document.getElementById("figureInfo");
  if (!container) return;
  container.innerHTML = `
    <div>
      <h3>Interpretation</h3>
      <p>${escapeHtml(info.interpretation)}</p>
    </div>
    <div>
      <h3>Publication Caption</h3>
      <p>${escapeHtml(info.caption)}</p>
    </div>
  `;
}

function figureNarrative(fig) {
  const target = state.target || "response";
  const contributionRows = Object.keys(state.generated).length ? buildDescriptorContributionRows() : [];
  const topDescriptor = contributionRows[0]?.descriptor || "the leading descriptor";
  const outlierRows = Object.keys(state.generated).length ? buildOutlierRows() : [];
  const narratives = {
    scatter: {
      interpretation: "This plot compares experimental and predicted activities. Points closer to the diagonal indicate better prediction agreement; systematic displacement above or below the line suggests model bias.",
      caption: `Experimental versus predicted ${target} values for training and test compounds. The dashed diagonal represents ideal prediction agreement.`
    },
    williams: {
      interpretation: "The Williams plot checks applicability domain using leverage and standardized residuals. Compounds beyond h* or outside +/-3 standardized residuals deserve closer inspection.",
      caption: `Williams plot for the QSAR model showing leverage values versus standardized residuals for training and test compounds. Dashed limits indicate h* and +/-3 residual thresholds.`
    },
    randomization: {
      interpretation: "Y-randomization evaluates whether the original model performs better than models built after response scrambling. A valid model should sit clearly away from low-R2 and low-Q2 scrambled models.",
      caption: "Y-randomization plot comparing the original QSAR model with response-scrambled models using R2 and Q2 metrics."
    },
    shap: {
      interpretation: "This interpretation plot approximates descriptor-level contribution for the linear MLR equation. Wider spread indicates stronger influence; point color represents the descriptor value.",
      caption: `Descriptor contribution plot for the MLR QSAR model, showing feature-value-dependent effects on predicted ${target}.`
    },
    correlation: {
      interpretation: "The heatmap summarizes pairwise descriptor-response correlations. Strong inter-descriptor correlations indicate possible redundancy, while descriptor-response correlations help explain activity trends.",
      caption: `Lower-triangle Pearson correlation heatmap among selected descriptors and ${target}.`
    },
    loading: {
      interpretation: "The supervised loading plot summarizes how descriptors relate to latent model factors. Descriptors near the response point tend to align with activity variation in the model space.",
      caption: `Two-component supervised loading plot for selected QSAR descriptors and ${target}.`
    },
    vip: {
      interpretation: `The VIP plot ranks descriptors by standardized model influence. In this model, ${topDescriptor} is the strongest contributor by the current VIP approximation.`,
      caption: "Variable importance projection (VIP) ranking for selected QSAR descriptors."
    },
    chemical: {
      interpretation: "The chemical space PCA plot shows whether training and test compounds occupy similar descriptor space. Test compounds far from the training cluster or outside AD status may be less reliable predictions.",
      caption: "Descriptor-based chemical space represented by the first two principal components, colored by train/test assignment or applicability-domain status."
    },
    residuals: {
      interpretation: "The residual distribution shows prediction error balance. A distribution centered near zero suggests limited systematic bias, while skewness or long tails highlight under- or over-predicted compounds.",
      caption: `Distribution of prediction residuals, calculated as predicted minus experimental ${target}, for training and test compounds.`
    },
    contribution: {
      interpretation: `This table combines coefficient direction, VIP, and descriptor-response correlation. It helps distinguish influential descriptors that increase predicted activity from those that decrease it.`,
      caption: `Descriptor contribution summary combining MLR coefficient sign, VIP score, and Pearson correlation with ${target}.`
    },
    outliers: {
      interpretation: `${outlierRows.length} compounds are listed for AD diagnostics. High leverage indicates unusual descriptor space, while high standardized residual indicates a poorly predicted compound.`,
      caption: "Applicability-domain diagnostic table listing compounds with high leverage, high standardized residuals, or the largest diagnostic scores."
    }
  };
  return narratives[fig] || { interpretation: "", caption: "" };
}

function buildChemicalSpaceData() {
  const combined = getCombinedAdRows();
  const matrix = combined.map(row => state.descriptors.map(desc => Number(row[desc])));
  const z = standardizeColumns(matrix);
  const corr = correlationMatrix(z);
  const eig = jacobiEigen(corr);
  const order = eig.values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
  const pc1 = order[0].index;
  const pc2 = order[1]?.index ?? order[0].index;
  const scores = z.map(row => ({
    pc1: sum(row.map((value, i) => value * eig.vectors[i][pc1])),
    pc2: sum(row.map((value, i) => value * eig.vectors[i][pc2]))
  }));
  const total = sum(eig.values.map(value => Math.max(0, value))) || 1;
  return {
    variance: [Math.max(0, eig.values[pc1]) / total, Math.max(0, eig.values[pc2]) / total],
    points: combined.map((row, i) => ({
      ...row,
      pc1: scores[i].pc1,
      pc2: scores[i].pc2
    }))
  };
}

function getCombinedAdRows() {
  const mapRow = (row, className) => {
    const adColumn = Object.keys(row).find(col => /ad\s*info|outlier\s*info/i.test(col));
    const out = { className, adStatus: normalizeAdStatus(adColumn ? row[adColumn] : "-") };
    if ("ID" in row) out.id = row.ID;
    state.descriptors.forEach(desc => out[desc] = Number(row[desc]));
    out[state.target] = Number(row[state.target]);
    return out;
  };
  return [
    ...state.tables.trainAd.rows.map(row => mapRow(row, "Training set")),
    ...state.tables.testAd.rows.map(row => mapRow(row, "Test set"))
  ];
}

function normalizeAdStatus(value) {
  const textValue = String(value || "").trim();
  if (!textValue || textValue === "-") return "Inside AD";
  return /outside|outlier|high/i.test(textValue) ? "Outside AD" : textValue;
}

function chemicalPointColor(point, mode) {
  if (mode === "ad") return point.adStatus === "Outside AD" ? state.settings.global.accentColor : "#2ca25f";
  return point.className === "Training set" ? state.settings.global.trainColor : state.settings.global.testColor;
}

function buildDescriptorContributionRows() {
  const rows = state.generated["SHAP.csv"] || [];
  const yValues = rows.map(row => Number(row[state.target]));
  const ySd = std(yValues) || 1;
  const raw = state.descriptors.map(desc => {
    const values = rows.map(row => Number(row[desc]));
    const coefficient = state.coefficients[desc] || 0;
    return {
      descriptor: desc,
      coefficient,
      raw: Math.abs(coefficient * (std(values) || 1) / ySd),
      corr: correlation(values, yValues)
    };
  });
  const denom = Math.sqrt(sum(raw.map(item => item.raw * item.raw)) / Math.max(1, raw.length)) || 1;
  return raw.map(item => {
    const sign = item.coefficient >= 0 ? "Positive" : "Negative";
    const color = item.coefficient >= 0 ? "#176b3a" : "#9a1c1c";
    return {
      descriptor: item.descriptor,
      sign,
      color,
      vip: item.raw / denom,
      corr: item.corr,
      interpretation: item.coefficient >= 0
        ? "Higher descriptor values increase predicted activity in the MLR equation."
        : "Higher descriptor values decrease predicted activity in the MLR equation."
    };
  }).sort((a, b) => b.vip - a.vip);
}

function buildOutlierRows() {
  const finalRows = state.generated["williams_plot_final.csv"] || [];
  const initialRows = state.generated["williams_plot_initial.csv"] || [];
  const decorated = finalRows.map((row, i) => {
    const leverageValue = Number(row.Leverage);
    const residualValue = Number(row["std resi"]);
    const highLeverage = leverageValue > state.stats.hStar;
    const highResidual = Math.abs(residualValue) > 3;
    const flags = [];
    if (highLeverage) flags.push("High leverage");
    if (highResidual) flags.push("High residual");
    return {
      id: initialRows[i]?.ID ?? i + 1,
      className: row.Class,
      leverage: leverageValue,
      stdResidual: residualValue,
      flag: flags.length ? flags.join("; ") : "Highest diagnostic score",
      color: flags.length ? state.settings.global.accentColor : "#555555",
      flagged: flags.length > 0,
      diagnosticScore: Math.max(leverageValue / Math.max(0.0001, state.stats.hStar), Math.abs(residualValue) / 3)
    };
  });
  const flagged = decorated.filter(row => row.flagged).sort((a, b) => b.diagnosticScore - a.diagnosticScore);
  const fallback = decorated.sort((a, b) => b.diagnosticScore - a.diagnosticScore).slice(0, 12);
  return (flagged.length ? flagged : fallback).slice(0, 18);
}

function tableTitle(cfg, titleValue) {
  return `<rect x="0" y="0" width="${cfg.width}" height="${cfg.height}" fill="#ffffff"/>`
    + text(cfg.width / 2, 38, titleValue, cfg.fs * 1.05, "middle", "#111", 700);
}

function tableHeader(columns, y, fs) {
  let svg = `<rect x="35" y="${y - 28}" width="${columns[columns.length - 1].x + columns[columns.length - 1].width - 35}" height="38" fill="#eef2f6" stroke="#d7dde5"/>`;
  columns.forEach(col => {
    svg += text(col.x + 8, y - 3, col.label, fs * 0.84, "start", "#111", 700);
  });
  return svg;
}

function svgWrappedCell(x, y, value, size, maxChars, maxLines, fill = "#111") {
  const words = String(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let lineValue = "";
  words.forEach(word => {
    const candidate = lineValue ? `${lineValue} ${word}` : word;
    if (candidate.length > maxChars && lineValue) {
      lines.push(lineValue);
      lineValue = word;
    } else {
      lineValue = candidate;
    }
  });
  if (lineValue) lines.push(lineValue);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) visible[maxLines - 1] = `${visible[maxLines - 1].replace(/\.*$/, "")}...`;
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="500" fill="${fill}">`
    + visible.map((linePart, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * 1.18}">${escapeHtml(linePart)}</tspan>`).join("")
    + "</text>";
}

function saveSettingsFromForm() {
  const fig = state.activeFigure;
  state.settings[fig].x = document.getElementById("xLabel").value;
  state.settings[fig].y = document.getElementById("yLabel").value;
  state.settings[fig].title = document.getElementById("plotTitle").value;
  state.settings.global.fontSize = Number(document.getElementById("fontSize").value) || 16;
  state.settings.global.trainColor = document.getElementById("trainColor").value;
  state.settings.global.testColor = document.getElementById("testColor").value;
  state.settings.global.lineColor = document.getElementById("lineColor").value;
  state.settings.global.accentColor = document.getElementById("accentColor").value;
  state.settings.global.chemicalColorMode = document.getElementById("chemicalColorMode").value;
}

function loadSettingsToForm() {
  const fig = state.activeFigure;
  document.getElementById("figureSelect").value = fig;
  document.getElementById("xLabel").value = state.settings[fig].x || "";
  document.getElementById("yLabel").value = state.settings[fig].y || "";
  document.getElementById("plotTitle").value = state.settings[fig].title || "";
  document.getElementById("fontSize").value = state.settings.global.fontSize;
  document.getElementById("trainColor").value = state.settings.global.trainColor;
  document.getElementById("testColor").value = state.settings.global.testColor;
  document.getElementById("lineColor").value = state.settings.global.lineColor;
  document.getElementById("accentColor").value = state.settings.global.accentColor;
  document.getElementById("chemicalColorMode").value = state.settings.global.chemicalColorMode;
}

function applyPrompt(prompt) {
  saveSettingsFromForm();
  const textValue = String(prompt || "").toLowerCase();
  const fig = state.activeFigure;
  const colorWords = {
    blue: "#4169e1",
    red: "#ff1f1f",
    black: "#111111",
    green: "#228b22",
    purple: "#7a3db8",
    orange: "#f28c28",
    gray: "#666666",
    grey: "#666666"
  };
  Object.entries(colorWords).forEach(([word, color]) => {
    if (textValue.includes(`training ${word}`) || textValue.includes(`train ${word}`)) state.settings.global.trainColor = color;
    if (textValue.includes(`test ${word}`)) state.settings.global.testColor = color;
    if (textValue.includes(`line ${word}`)) state.settings.global.lineColor = color;
  });
  const fontMatch = textValue.match(/font(?: size)?\s*(\d+)/i);
  if (fontMatch) state.settings.global.fontSize = clamp(Number(fontMatch[1]), 9, 36);
  const xMatch = prompt.match(/x\s*(?:axis|label)?\s*[:=]?\s*([^,;]+)/i);
  if (xMatch) state.settings[fig].x = xMatch[1].trim();
  const yMatch = prompt.match(/y\s*(?:axis|label)?\s*[:=]?\s*([^,;]+)/i);
  if (yMatch) state.settings[fig].y = yMatch[1].trim();
  const titleMatch = prompt.match(/title\s*[:=]?\s*([^,;]+)/i);
  if (titleMatch) state.settings[fig].title = titleMatch[1].trim();
}

function toCSV(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const lines = [columns.map(csvEscape).join(",")];
  rows.forEach(row => {
    lines.push(columns.map(col => csvEscape(row[col])).join(","));
  });
  return lines.join("\r\n");
}

function csvEscape(value) {
  const textValue = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
}

function downloadActiveSvg() {
  const name = `${state.activeFigure}.svg`;
  const blob = new Blob([state.svg], { type: "image/svg+xml;charset=utf-8" });
  offerExport(name, blob, "SVG export ready. If the automatic download did not start, use this link:");
}

function downloadActivePng() {
  exportSvgToPng(state.svg, `${state.activeFigure}.png`, (name, blob) => {
    offerExport(name, blob, "PNG export ready. If the automatic download did not start, use this link:");
  });
}

function exportSvgToPng(svgText, name, done) {
  const match = svgText.match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/);
  const width = match ? Number(match[1]) : 1200;
  const height = match ? Number(match[2]) : 800;
  const img = new Image();
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(pngBlob => {
      if (pngBlob) {
        done(name, pngBlob);
      } else {
        done(name, dataUrlToBlob(canvas.toDataURL("image/png")));
      }
    }, "image/png");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("PNG conversion failed. Download SVG instead, or try opening the dashboard in Chrome/Edge.", true);
  };
  img.src = url;
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = (header.match(/data:([^;]+)/) || [])[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function offerExport(name, blob, message) {
  const url = URL.createObjectURL(blob);
  exportUrls.push(url);
  offerExportUrl(name, url, message);
  saveBlobExportToServer(name, blob, setStatus);
  triggerDownload(name, url);
}

function offerExportUrl(name, url, message) {
  const container = document.getElementById("exportLinks");
  container.classList.add("is-visible");
  container.innerHTML = `<span>${escapeHtml(message)}</span>`;
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = `Save ${name}`;
  container.appendChild(link);
}

function triggerDownload(name, url) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function saveTextExportToServer(name, content, statusFn) {
  if (location.protocol === "file:") {
    statusFn("Browser downloads are blocked in file mode. Run server.py and open http://127.0.0.1:8000/index.html.", true);
    return false;
  }
  try {
    const response = await fetch("/save-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: name, content, encoding: "text" })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Save failed");
    statusFn(`Saved ${name} to exports folder.`);
    return true;
  } catch (error) {
    console.error(error);
    statusFn(`Could not save ${name} to exports folder. Use localhost server mode.`, true);
    return false;
  }
}

async function saveBlobExportToServer(name, blob, statusFn) {
  if (location.protocol === "file:") {
    statusFn("Browser downloads are blocked in file mode. Run server.py and open http://127.0.0.1:8000/index.html.", true);
    return false;
  }
  try {
    const base64 = await blobToBase64(blob);
    const response = await fetch("/save-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: name, content: base64, encoding: "base64" })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Save failed");
    statusFn(`Saved ${name} to exports folder.`);
    return true;
  } catch (error) {
    console.error(error);
    statusFn(`Could not save ${name} to exports folder. Use localhost server mode.`, true);
    return false;
  }
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function clearExportLinks() {
  exportUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
  const container = document.getElementById("exportLinks");
  if (!container) return;
  container.classList.remove("is-visible");
  container.innerHTML = "";
}

function svgOpen(cfg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cfg.width}" height="${cfg.height}" viewBox="0 0 ${cfg.width} ${cfg.height}" role="img">`;
}

function plotTitle(cfg, titleValue) {
  if (!titleValue) return "";
  return text(cfg.width / 2, 38, titleValue, cfg.fs * 1.15, "middle", "#111", 700);
}

function axes(cfg, x, y, xMin, xMax, yMin, yMax, xLabel, yLabel) {
  return axisBottom(cfg, x, xMin, xMax, cfg.height - cfg.margin.bottom, xLabel)
    + axisLeft(cfg, y, yMin, yMax, yLabel);
}

function axisBottom(cfg, scale, minValue, maxValue, yPos, label) {
  let svg = line(cfg.margin.left, yPos, cfg.width - cfg.margin.right, yPos, "#111", 2, "");
  ticks(minValue, maxValue, 7).forEach(value => {
    const xx = scale(value);
    svg += line(xx, yPos, xx, yPos + 10, "#111", 2, "");
    svg += text(xx, yPos + 34, formatTick(value), cfg.fs, "middle", "#111", 700);
  });
  svg += axisLabelBottom(cfg, label);
  return svg;
}

function axisLabelBottom(cfg, label) {
  if (!label) return "";
  return text(cfg.width / 2, cfg.height - 35, label, cfg.fs * 1.35, "middle", "#111", 700);
}

function axisLeft(cfg, scale, minValue, maxValue, label) {
  const xPos = cfg.margin.left;
  let svg = line(xPos, cfg.margin.top, xPos, cfg.height - cfg.margin.bottom, "#111", 2, "");
  ticks(minValue, maxValue, 7).forEach(value => {
    const yy = scale(value);
    svg += line(xPos - 10, yy, xPos, yy, "#111", 2, "");
    svg += text(xPos - 18, yy + 6, formatTick(value), cfg.fs, "end", "#111", 700);
  });
  if (label) {
    svg += `<text x="38" y="${cfg.height / 2}" transform="rotate(-90 38 ${cfg.height / 2})" font-size="${cfg.fs * 1.35}" font-weight="700" text-anchor="middle" fill="#111">${escapeHtml(label)}</text>`;
  }
  return svg;
}

function marker(cx, cy, shape, color, size) {
  if (shape === "triangle") {
    const p = `${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`;
    return `<polygon points="${p}" fill="${color}" stroke="#111" stroke-width="3"/>`;
  }
  if (shape === "square") {
    return `<rect x="${cx - size}" y="${cy - size}" width="${size * 2}" height="${size * 2}" fill="${color}" stroke="#111" stroke-width="2.4"/>`;
  }
  if (shape === "x") {
    return `<g stroke="${color}" stroke-width="7" stroke-linecap="round"><line x1="${cx - size}" y1="${cy - size}" x2="${cx + size}" y2="${cy + size}"/><line x1="${cx + size}" y1="${cy - size}" x2="${cx - size}" y2="${cy + size}"/></g>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${size}" fill="${color}" stroke="#111" stroke-width="3"/>`;
}

function legend(x, y, items, fs) {
  const rowH = 42;
  let svg = `<g>`;
  items.forEach((item, i) => {
    const yy = y + i * rowH;
    svg += marker(x + 20, yy, item[2], item[1], 9);
    svg += text(x + 55, yy + 7, item[0], fs * 1.05, "start", "#111", 700);
  });
  return svg + "</g>";
}

function text(x, y, value, size, anchor = "start", fill = "#111", weight = 400) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${escapeHtml(value)}</text>`;
}

function rotatedText(x, y, value, size, angle) {
  return `<text x="${x}" y="${y}" transform="rotate(${angle} ${x} ${y})" font-size="${size}" font-weight="700" text-anchor="end" fill="#111">${escapeHtml(value)}</text>`;
}

function rotatedTextStart(x, y, value, size, angle) {
  return `<text x="${x}" y="${y}" transform="rotate(${angle} ${x} ${y})" font-size="${size}" font-weight="700" text-anchor="start" fill="#111">${escapeHtml(value)}</text>`;
}

function wrappedCenteredText(x, y, value, size, maxChars, maxLines) {
  const words = String(value).replace(/([_()/.-])/g, "$1 ").split(/\s+/).filter(Boolean);
  const lines = [];
  let lineValue = "";
  words.forEach(word => {
    const candidate = lineValue ? `${lineValue} ${word}` : word;
    if (candidate.length > maxChars && lineValue) {
      lines.push(lineValue);
      lineValue = word;
    } else {
      lineValue = candidate;
    }
  });
  if (lineValue) lines.push(lineValue);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) visible[maxLines - 1] = `${visible[maxLines - 1].replace(/\.*$/, "")}...`;
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" text-anchor="middle" fill="#111">`
    + visible.map((lineValuePart, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * 1.18}">${escapeHtml(lineValuePart)}</tspan>`).join("")
    + "</text>";
}

function line(x1, y1, x2, y2, color, width, dash) {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${dashAttr}/>`;
}

function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
  const span = domainMax - domainMin || 1;
  return value => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

function ticks(minValue, maxValue, count) {
  const out = [];
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return [0];
  const step = (maxValue - minValue) / Math.max(1, count - 1);
  for (let i = 0; i < count; i += 1) out.push(minValue + step * i);
  return out;
}

function formatTick(value) {
  const abs = Math.abs(value);
  if (abs >= 10) return String(round(value, 0));
  if (abs >= 1) return String(round(value, 1));
  return String(round(value, 2));
}

function colorBar(x, y0, y1, fs) {
  let svg = "";
  const n = 60;
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const y = y1 - (y1 - y0) * t;
    svg += `<rect x="${x}" y="${y}" width="16" height="${(y1 - y0) / n + 1}" fill="${colorRamp(t)}"/>`;
  }
  svg += text(x + 28, y0 + 10, "High", fs * 1.25, "start", "#111", 400);
  svg += text(x + 28, y1 + 5, "Low", fs * 1.25, "start", "#111", 400);
  svg += `<text x="${x + 92}" y="${(y0 + y1) / 2}" transform="rotate(-90 ${x + 92} ${(y0 + y1) / 2})" font-size="${fs * 1.2}" text-anchor="middle" fill="#111">Feature value</text>`;
  return svg;
}

function colorRamp(t) {
  const clamped = clamp(t, 0, 1);
  const low = [42, 78, 190];
  const mid = [232, 232, 232];
  const high = [188, 0, 38];
  const a = clamped < 0.5 ? low : mid;
  const b = clamped < 0.5 ? mid : high;
  const u = clamped < 0.5 ? clamped * 2 : (clamped - 0.5) * 2;
  const rgb = a.map((v, i) => Math.round(v + (b[i] - v) * u));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function corrColor(value) {
  return colorRamp((value + 1) / 2);
}

function correlationLegend(x, y, h, fs) {
  let svg = "";
  for (let i = 0; i < 80; i += 1) {
    const t = i / 79;
    svg += `<rect x="${x}" y="${y + h - t * h}" width="18" height="${h / 80 + 1}" fill="${corrColor(t * 2 - 1)}"/>`;
  }
  svg += text(x + 30, y + 5, "1.00", fs * 0.9, "start", "#111", 400);
  svg += text(x + 30, y + h / 2 + 5, "0.00", fs * 0.9, "start", "#111", 400);
  svg += text(x + 30, y + h + 5, "-1.00", fs * 0.9, "start", "#111", 400);
  return svg;
}

function transpose(a) {
  return a[0].map((_, c) => a.map(row => row[c]));
}

function multiply(a, b) {
  const out = Array.from({ length: a.length }, () => Array(b[0].length).fill(0));
  for (let i = 0; i < a.length; i += 1) {
    for (let k = 0; k < b.length; k += 1) {
      for (let j = 0; j < b[0].length; j += 1) out[i][j] += a[i][k] * b[k][j];
    }
  }
  return out;
}

function inverse(matrix) {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row.map(v => Number(v)), ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < n; r += 1) if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
    if (Math.abs(a[pivot][i]) < 1e-10) {
      a[i][i] += 1e-8;
      pivot = i;
    }
    [a[i], a[pivot]] = [a[pivot], a[i]];
    const div = a[i][i] || 1e-8;
    for (let j = 0; j < 2 * n; j += 1) a[i][j] /= div;
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const factor = a[r][i];
      for (let j = 0; j < 2 * n; j += 1) a[r][j] -= factor * a[i][j];
    }
  }
  return a.map(row => row.slice(n));
}

function buildPlsLoadingPoints(rows) {
  const xRaw = rows.map(row => state.descriptors.map(desc => Number(row[desc])));
  const x = standardizeColumns(xRaw);
  const yRaw = rows.map(row => Number(row[state.target]));
  const yMean = average(yRaw);
  const yStd = std(yRaw) || 1;
  let yh = yRaw.map(value => (value - yMean) / yStd);
  let xh = x.map(row => [...row]);
  const scores = [];

  for (let component = 0; component < 2; component += 1) {
    let w = state.descriptors.map((_, col) => sum(xh.map((row, i) => row[col] * yh[i])));
    const wNorm = Math.sqrt(sum(w.map(value => value * value))) || 1;
    w = w.map(value => value / wNorm);
    const t = xh.map(row => sum(row.map((value, col) => value * w[col])));
    const denom = sum(t.map(value => value * value)) || 1;
    const q = sum(t.map((value, i) => value * yh[i])) / denom;
    const pLoad = state.descriptors.map((_, col) => sum(xh.map((row, i) => row[col] * t[i])) / denom);
    xh = xh.map((row, i) => row.map((value, col) => value - t[i] * pLoad[col]));
    yh = yh.map((value, i) => value - t[i] * q);
    scores.push(t);
  }

  const points = state.descriptors.map((desc, col) => ({
    label: desc,
    x: correlation(x.map(row => row[col]), scores[0]),
    y: correlation(x.map(row => row[col]), scores[1]),
    target: false
  }));
  points.push({
    label: state.target,
    x: correlation(yRaw.map(value => (value - yMean) / yStd), scores[0]),
    y: correlation(yRaw.map(value => (value - yMean) / yStd), scores[1]),
    target: true
  });

  const targetPoint = points.find(point => point.target);
  const flipX = targetPoint && targetPoint.x < 0 ? -1 : 1;
  const flipY = targetPoint && targetPoint.y > 0 ? -1 : 1;
  points.forEach(point => {
    point.x *= flipX;
    point.y *= flipY;
  });
  return points;
}

function leverage(row, inv) {
  const tmp = inv.map(invRow => sum(invRow.map((value, i) => value * row[i])));
  return sum(row.map((value, i) => value * tmp[i]));
}

function standardizeColumns(rows) {
  const cols = transpose(rows);
  const means = cols.map(average);
  const sds = cols.map(std);
  return rows.map(row => row.map((value, i) => (value - means[i]) / (sds[i] || 1)));
}

function correlationMatrix(rows) {
  const cols = transpose(rows);
  return cols.map(a => cols.map(b => correlation(a, b)));
}

function jacobiEigen(matrix) {
  const n = matrix.length;
  const a = matrix.map(row => [...row]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
  for (let iter = 0; iter < 80; iter += 1) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        if (Math.abs(a[i][j]) > max) {
          max = Math.abs(a[i][j]);
          p = i;
          q = j;
        }
      }
    }
    if (max < 1e-10) break;
    const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    for (let i = 0; i < n; i += 1) {
      const aip = a[i][p];
      const aiq = a[i][q];
      a[i][p] = c * aip - s * aiq;
      a[i][q] = s * aip + c * aiq;
    }
    for (let j = 0; j < n; j += 1) {
      const apj = a[p][j];
      const aqj = a[q][j];
      a[p][j] = c * apj - s * aqj;
      a[q][j] = s * apj + c * aqj;
    }
    for (let i = 0; i < n; i += 1) {
      const vip = v[i][p];
      const viq = v[i][q];
      v[i][p] = c * vip - s * viq;
      v[i][q] = s * vip + c * viq;
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

function correlation(a, b) {
  const am = average(a);
  const bm = average(b);
  const num = sum(a.map((value, i) => (value - am) * (b[i] - bm)));
  const den = Math.sqrt(sum(a.map(value => Math.pow(value - am, 2))) * sum(b.map(value => Math.pow(value - bm, 2))));
  return den ? num / den : 0;
}

function average(values) {
  return sum(values) / Math.max(1, values.length);
}

function std(values) {
  const mean = average(values);
  return Math.sqrt(sum(values.map(value => Math.pow(value - mean, 2))) / Math.max(1, values.length - 1));
}

function sum(values) {
  return values.reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function round(value, digits) {
  const factor = Math.pow(10, digits);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}
