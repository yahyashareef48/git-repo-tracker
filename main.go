package main

import (
	"embed"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

// appIconPNG is the source for the tray icon, badge included. Embedding it
// keeps the tray working from a portable exe with no files beside it.
//
//go:embed build/appicon.png
var appIconPNG []byte

// version is stamped at build time with -ldflags "-X main.version=x.y.z".
// A plain build leaves it as "dev", which the updater treats as always current.
var version = "dev"

// releaseRepo is where update checks look for newer builds.
const releaseRepo = "yahyashareef48/git-repo-tracker"

func main() {
	// WebView2 is Chromium, and it starts a browser, GPU, renderer, crashpad and
	// two utility processes whatever the page is. For a list of text rows that
	// is a lot of memory spent on capability this app never uses, so the parts
	// that cost the most and buy the least are turned off:
	//
	//   - the GPU process (~90 MB) — nothing here is canvas, video or WebGL, and
	//     software compositing renders a list of rows perfectly well. The Mica
	//     backdrop is a window effect and is unaffected.
	//   - a large V8 heap — the frontend holds a few hundred repo rows and a
	//     capped log, nowhere near the default ceiling.
	//   - background networking and translation, which have nothing to do here.
	//
	// Set before wails.Run, since WebView2 reads it when the environment is
	// created.
	os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", strings.Join([]string{
		"--js-flags=--max-old-space-size=128",
		"--disable-background-networking",
		"--disable-features=Translate,MediaRouter,OptimizationHints",
	}, " "))

	app := NewApp()
	app.version = version

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
			// See the note in main() — this alone drops a whole process.
			WebviewGpuIsDisabled: true,
		},
		OnStartup: app.startup,
		// Closing the window hides to the tray instead of exiting, unless the
		// user turned that off or picked Quit from the tray menu.
		OnBeforeClose: app.beforeClose,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
