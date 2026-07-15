const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sampleDir = process.argv[2];

if (!sampleDir) {
  console.error("Usage: node smoke-test.js <folder-containing-six-input-files>");
  process.exit(2);
}

const appCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const testCode = `
const sampleDir = ${JSON.stringify(sampleDir)};
const load = name => require("fs").readFileSync(require("path").join(sampleDir, name), "utf8");
state.files = {
  summary: { text: load("Fungus_model_SummaryResults.txt") },
  yrand: { text: load("Fungus_model_YRandomizationResults.csv") },
  trainAd: { text: load("Fungus_model_Train_StdAD.csv") },
  testAd: { text: load("Fungus_model_Test_StdAD.csv") },
  trainLog: { text: load("Fungus_model_TRAINCalcLog.csv") },
  testLog: { text: load("Fungus_model_TESTCalcLog.csv") }
};
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
const rand = buildRandomization();
const shap = buildShapTable();
const will = buildWilliams();
state.generated = {
  "scatter_plot.csv": scatter.rows,
  "Randomization.csv": rand.rows,
  "SHAP.csv": shap.rows,
  "williams_plot_initial.csv": will.initialRows,
  "williams_plot_final.csv": will.finalRows
};
state.stats = {
  trainCount: state.tables.trainAd.rows.length,
  testCount: state.tables.testAd.rows.length,
  descriptorCount: state.descriptors.length,
  hStar: will.hStar,
  randomCount: rand.rows.length - 1
};
const renderedFigures = ["scatter", "williams", "randomization", "shap", "correlation", "loading", "vip", "chemical", "residuals", "contribution", "outliers"].map(name => {
  state.activeFigure = name;
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
  return [name, renderers[name]().length];
});
const targetDetectionChecks = {
  pEC50: detectTargetColumn(["ID", "Feature_1", "Feature_2", "pEC50 (mOLAR)", "OUTLIER"]),
  pIC50: detectTargetColumn(["ID", "D1", "D2", "pIC50", "AD Info."]),
  oddBeforeOutlier: detectTargetColumn(["ID", "D1", "D2", "My Custom Endpoint", "OUTLIER"])
};
const predictionTable = typedRows(parseCSV(load("Fungus_model_Test_StdAD.csv")));
const predictionInv = modelLeverageInverse();
state.predictions = predictionTable.rows.map((row, index) => {
  const descriptorValues = state.descriptors.map(desc => Number(row[desc]));
  const predicted = state.intercept + sum(state.descriptors.map((desc, i) => (state.coefficients[desc] || 0) * descriptorValues[i]));
  const leverageValue = leverage([1, ...descriptorValues], predictionInv);
  const label = getPredictionLabel(row, detectNameColumn(predictionTable.columns), index);
  return {
    ID: row.ID ?? index + 1,
    "Display name": label,
    ["Predicted " + state.target]: round(predicted, 6),
    Leverage: round(leverageValue, 6),
    "AD status": leverageValue <= state.stats.hStar ? "Inside AD" : "Outside AD",
    _label: label,
    _prediction: predicted,
    _leverage: leverageValue
  };
});
state.predictionSvg = renderInsubriaPlot();
state.predictionRankSvg = renderPredictionRankPlot();
state.predictionCsv = toCSV(state.predictions.map(row => {
  const clean = { ...row };
  delete clean._prediction;
  delete clean._leverage;
  delete clean._label;
  return clean;
}));
console.log(JSON.stringify({
  target: state.target,
  descriptors: state.descriptors,
  scatterRows: scatter.rows.length,
  randomizationRows: rand.rows.length,
  shapRows: shap.rows.length,
  williamsInitialRows: will.initialRows.length,
  williamsFinalRows: will.finalRows.length,
  hStar: Math.round(will.hStar * 1000000) / 1000000,
  firstWilliams: will.finalRows[0],
  renderedFigures,
  targetDetectionChecks,
  predictionRows: state.predictions.length,
  predictionSvgLength: state.predictionSvg.length,
  predictionRankSvgLength: state.predictionRankSvg.length,
  predictionCsvLength: state.predictionCsv.length,
  firstPrediction: state.predictions[0]
}, null, 2));
`;

const context = {
  require,
  console,
  FileReader: function FileReader() {},
  Blob: function Blob() {},
  Image: function Image() {},
  URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
  document: {
    addEventListener() {},
    getElementById() {
      return {
        addEventListener() {},
        value: "",
        files: [],
        textContent: "",
        className: "",
        innerHTML: "",
        disabled: false,
        appendChild() {}
      };
    },
    createElement() {
      return { click() {}, remove() {}, style: {} };
    },
    body: { appendChild() {} }
  }
};

vm.createContext(context);
vm.runInContext(`${appCode}\n${testCode}`, context);
