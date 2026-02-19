# tipitaka.app - Chatta Sangayana Tipitaka

## Building the Website (Frontend)
`npm run build` will build the frontend application into the `dist` directory (referenced by `index.html`).

`npm run dev` to run the frontend in development mode with hot reload.

## Building Apps for Windows, Mac, and Linux

### Prerequisites
- Go 1.22+
- GCC (MinGW for Windows cross-compilation on Linux/Mac)

### Build Process
The desktop applications are built using a Go server that serves the frontend and handles database queries.

Run the build script:
    ```bash
    ./server/build-all.sh
    ```
    This script will cross-compile the application for Linux, Windows, and macOS. The binaries will be output to `server/bin`.

### Running Locally
To run the server locally for development or testing:
1.  Navigate to the `server` directory.
2.  Run the Go server pointing to the project root:
    ```bash
    go run main.go -root-path=../
    ```
    -   `-root-path=../` tells the server to look for `dist` and `server-data` in the parent directory.
    -   Use `-no-open` to prevent the browser from opening automatically.

### Distribution
To create a distribution package, include:
*   The compiled binary (e.g., `tipitaka_app_windows_intel.exe`)
*   `dist` directory (frontend build)
*   `server-data` directory (databases)
    *   **Note:** `server-data/db/dict-all.db` (Full Text Search DB) is large and not included in the repository. It must be downloaded separately and placed in `server-data/db/`.
*   The following script can create these zip files for all supported OS'es with the above files included
    ```bash
    ./server/create-zips.sh
    ```

## Setting up the Online Website (https://tipitaka.app)
The same Linux binary is used to serve requests for the online website.

1.  Clone this repository.
2.  Build the frontend:
    ```bash
    npm run build
    ```
3.  Build the Go server for Linux (most droplets use Linux)
4.  Ensure `server-data` is populated, including `dict-all.db` (copy from existing deployment or download).
5.  Copy the `dist`, Go server (`tipitaka_app_linux_intel`) and `server-data` folder to the droplet 
5.  Run the server:
    ```bash
    chmod +x tipitaka_app_linux_intel
    ./tipitaka_app_linux_intel -root-path=. -no-open
    ```
6.  Use a process manager like `pm2` or `systemd` to keep it running.

## Building Apps for Android
The Android app uses a WebView to display the content and serves data via a local server setup within the app.

### Files to Include
1.  **Frontend**: Run `npm run build`. Copy the **contents** of the `dist` directory to `Android/app/src/main/assets/dist`.
    *   (`dist` directory should be inside `assets`)
2.  **Data**: Copy the `server-data` directory (ensure `dict-all.db` is included) to `Android/server_data/src/main/assets/server-data`.
    *   The Android project uses the `:server_data` module as an **Asset Pack** to manage large data files.

### Build Process
1.  Open the [`Android` repository](https://github.com/pathnirvana/tipitaka.app-android-app) in Android Studio.
2.  Build the release APK/Bundle as usual.

## License 
Attribution-ShareAlike CC BY-SA https://creativecommons.org/licenses/by-sa/4.0/
You must give appropriate credit, provide a link to the license, and indicate if changes were made.

The VRI texts in the static/texts directory are copyrighted to VRI (https://www.vridhamma.org/). 
