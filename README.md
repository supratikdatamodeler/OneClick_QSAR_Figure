# QSAR Figure Dashboard

This workspace contains a first local dashboard for turning six QSAR model output files into figure-ready CSV files and publication-style plots.

## Inputs

Upload these six files in the dashboard:

1. `Fungus_model_SummaryResults.txt`
2. `Fungus_model_YRandomizationResults.csv`
3. `Fungus_model_Train_StdAD.csv`
4. `Fungus_model_Test_StdAD.csv`
5. `Fungus_model_TRAINCalcLog.csv`
6. `Fungus_model_TESTCalcLog.csv`

The browser cannot auto-read a local path for security reasons, so the user selects the files manually.

## Generated CSV files

The dashboard generates:

1. `scatter_plot.csv`
2. `Randomization.csv`
3. `SHAP.csv`
4. `williams_plot_initial.csv`
5. `williams_plot_final.csv`

## Figures

The current dashboard renders:

- Observed vs predicted scatter plot
- Williams plot
- Y-randomization plot
- SHAP-style descriptor contribution plot for the linear MLR equation
- Correlation heatmap
- Factor loading plot
- VIP plot based on standardized linear coefficients
- Chemical space PCA plot colored by train/test set or AD status
- Residual distribution plot
- Descriptor contribution summary table
- Applicability-domain diagnostic outlier table

Each selected view also shows a short interpretation note and a suggested publication caption.

## Prediction

After generating the model workflow, upload an external descriptor-space CSV in the Prediction panel. The file must contain the modeled descriptor columns. The dashboard calculates:

- predicted response for each compound
- leverage value
- inside/outside AD status using the critical HAT threshold
- Insubria plot with training, test, and external prediction points
- user-selected top and least compounds by predicted response as both tables and a horizontal bar plot
- compound names in rankings when a name-like column is present; otherwise IDs are used
- persistent Save/Open/Copy links for prediction CSV, Insubria SVG, and top/least SVG exports
- downloadable Insubria SVG/PNG exports

The dashboard footer includes creator/contact information for the future GitHub and Streamlit release.

Each figure supports editable axis labels, title, font size, colors, and simple prompt-style commands such as:

```text
make training blue, test red, x axis Experimental pLC50, y axis Predicted pLC50, font 18
```

## Run

Open `index.html` in a browser. No server or package install is required for this first version.

For reliable exports, use the local server instead of opening the file directly:

```powershell
& 'C:\Users\skar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' export_server.js
```

Then open:

```text
http://127.0.0.1:8000/index.html
```

When running through the local server, CSV/SVG/PNG exports can be saved directly into:

```text
exports/
```

## Validation

The sample workflow can be checked with:

```powershell
& 'C:\Users\skar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' smoke-test.js 'C:\Users\skar\OneDrive - kean.edu\Documents\Supratik Kar\NSF-Maria\Work-1\QSAR data\QSAR Model\Final model'
```

The smoke test verifies descriptor detection, row counts for the generated CSVs, and Williams plot leverage calculation.

## Next Streamlit Step

When moving to Streamlit/GitHub, the calculation functions should be ported from `app.js` into a Python module, then the figure controls can be implemented with Streamlit widgets and Matplotlib/Plotly exports.
