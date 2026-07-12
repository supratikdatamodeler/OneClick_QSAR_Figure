from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


APP_DIR = Path(__file__).resolve().parent


def read_text(name: str) -> str:
    return (APP_DIR / name).read_text(encoding="utf-8")


def build_dashboard_html() -> str:
    html = read_text("index.html")
    css = read_text("styles.css")
    js = read_text("app.js")

    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script src="app.js"></script>', f"<script>\n{js}\n</script>")
    return html


st.set_page_config(
    page_title="QSAR Figure Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.title("QSAR Figure Dashboard")
st.caption(
    "Upload QSAR model output files, generate publication-quality figures, "
    "run external predictions, and export results."
)

with st.expander("Required input files", expanded=False):
    st.markdown(
        """
        Upload these six files inside the dashboard:

        1. `*_SummaryResults.txt`
        2. `*_YRandomizationResults.csv`
        3. `*_Train_StdAD.csv`
        4. `*_Test_StdAD.csv`
        5. `*_TRAINCalcLog.csv`
        6. `*_TESTCalcLog.csv`

        For prediction, upload an external descriptor-space CSV containing the modeled descriptor columns.
        """
    )

components.html(build_dashboard_html(), height=2200, scrolling=True)

st.markdown(
    """
    ---
    **Supratik Kar, Ph.D.**  
    *Associate Professor*  
    *Chemometrics & Molecular Modeling Laboratory*  
    *Department of Chemistry*  
    *Kean University, New Jersey, USA*  
    Contact: [supratik.kar@kean.edu](mailto:supratik.kar@kean.edu)
    """
)
