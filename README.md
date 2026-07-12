# QSAR Figure Dashboard

This workspace contains a first local dashboard for turning six QSAR model output files into figure-ready CSV files and publication-style plots.

Access: https://oneclickqsarfigure.streamlit.app/

## Inputs

Upload these six files in the dashboard:

1. `model_SummaryResults.txt`
2. `model_YRandomizationResults.csv`
3. `model_Train_StdAD.csv`
4. `model_Test_StdAD.csv`
5. `model_TRAINCalcLog.csv`
6. `model_TESTCalcLog.csv`

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

make training blue, test red, x axis Experimental pLC50, y axis Predicted pLC50, font 18
```

