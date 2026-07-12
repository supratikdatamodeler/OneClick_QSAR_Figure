# GitHub and Streamlit Deployment

## Files to Upload to GitHub

Upload these files and folders:

```text
streamlit_app.py
streamlit_app.py.txt
requirements.txt
README.md
DEPLOYMENT.md
.gitignore
.streamlit/config.toml
index.html
app.js
styles.css
export_server.js
smoke-test.js
```

`streamlit_app.py.txt` is a readable backup. If `streamlit_app.py` is blocked by OneDrive or upload tooling, upload `streamlit_app.py.txt` and rename it to `streamlit_app.py` in GitHub.

Do not upload local outputs or private-path files:

```text
exports/
*.log
qsar_input_files.md
server_blocked_placeholder.py
qsar_server.py
```

## Run Locally as Streamlit

Install dependencies:

```bash
pip install -r requirements.txt
```

Run:

```bash
streamlit run streamlit_app.py
```

## Deploy on Streamlit Community Cloud

1. Create a GitHub repository, for example `QSAR-Figure-Dashboard`.
2. Upload the required files listed above.
3. Go to Streamlit Community Cloud.
4. Choose **New app**.
5. Select the GitHub repository.
6. Set the main file path to:

```text
streamlit_app.py
```

7. Deploy.

## Notes

- The current Streamlit app embeds the completed HTML/JavaScript dashboard.
- Users upload all model files through the browser; no local data files are stored in the GitHub repository.
- Browser downloads should work better in deployed Streamlit than in local `file://` mode.
- For local non-Streamlit use, `export_server.js` can save exports into the local `exports/` folder.
