import { BrowserWindow, Menu } from 'electron';

export function setupMenu(win: BrowserWindow): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    win.removeMenu();
    win.setMenuBarVisibility(false);

    return;
  }

  const app = Menu.getApplicationMenu();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(app ? app.items : []),
      {
        label: 'Go',
        submenu: [
          {
            label: 'Back',
            accelerator: 'CmdOrCtrl+[',
            click: () => {
              win?.webContents.navigationHistory.goBack();
            },
          },
          {
            label: 'Forward',
            accelerator: 'CmdOrCtrl+]',
            click: () => {
              win?.webContents.navigationHistory.goForward();
            },
          },
        ],
      },
    ]),
  );
}
