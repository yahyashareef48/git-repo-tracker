package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "GitDeck",
		Width:     1180,
		Height:    780,
		MinWidth:  880,
		MinHeight: 560,
		// The titlebar is drawn in the frontend so it can carry the repo
		// count, the GitHub status dot and the window controls.
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// Mica needs a transparent webview and window to show through.
		BackgroundColour: &options.RGBA{R: 12, G: 14, B: 20, A: 1},
		Windows: &windows.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			BackdropType:         windows.Mica,
			Theme:                windows.Dark,
			DisableWindowIcon:    false,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
