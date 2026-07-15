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

The response column can use common QSAR names such as `pLC50`, `pEC50`, `pIC50`, `pKi`, `pKd`, `pMIC`, or `pChEMBL`. If a response has an unusual name, place it immediately before the `OUTLIER`, `AD Info`, or other info column; the app will use that preceding column as the response. Descriptor count is not fixed; the workflow uses all numeric descriptor columns except ID, response, AD, class, info, and outlier columns.

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

