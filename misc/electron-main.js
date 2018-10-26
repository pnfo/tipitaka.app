const { protocol, app, BrowserWindow } = require('electron');
const url = require('url');  
const path = require('path');

  // Keep a global reference of the window object, if you don't, the window will
  // be closed automatically when the JavaScript object is garbage collected.
  let win
  
  function createWindow () {
    const WEB_FOLDER = '..';
    const PROTOCOL = 'file';
    /*protocol.interceptFileProtocol(PROTOCOL, (request, callback) => {
        // // Strip protocol
        let url = request.url.substr(PROTOCOL.length + 1);

        // Build complete path for node require function
        url = path.join(__dirname, WEB_FOLDER, url);

        // Replace backslashes by forward slashes (windows)
        // url = url.replace(/\\/g, '/');
        url = path.normalize(url);

        console.log(url);
        callback({path: url});
    });*/

    // Create the browser window.
    win = new BrowserWindow({ width: 1000, height: 800, title: 'tipitaka.app', show: false,
        webPreferences: {
        //  webSecurity: false
          nodeIntegration: false,
        }
      });
  
    // and load the index.html of the app.
    //win.loadFile('index.html')
    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: 'index.html',
        protocol: PROTOCOL + ':',
        slashes: true
    }));
    //win.loadURL(`file://${__dirname}/../index.html`);
  
    win.setMenu(null); // remove the menu bar

    // Open the DevTools.
    win.webContents.openDevTools()
  
    // Emitted when the window is closed.
    win.on('closed', () => {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      win = null
    })
    win.once('ready-to-show', () => {
      win.show()
    })
  }
  
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on('ready', createWindow)
  
  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
  
  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
      createWindow()
    }
  })
  
  // In this file you can include the rest of your app's specific main process
  // code. You can also put them in separate files and require them here.