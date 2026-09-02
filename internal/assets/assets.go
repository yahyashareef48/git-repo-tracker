// Package assets holds files both binaries embed.
//
// Go's embed cannot reach outside its own package directory, so the icon lives
// here rather than in build/, where only the Wails app could have reached it.
package assets

import (
	"bytes"
	_ "embed"
	"image"
	"image/png"
)

//go:embed appicon.png
var appIconPNG []byte

// AppIcon decodes the application icon.
func AppIcon() (image.Image, error) {
	return png.Decode(bytes.NewReader(appIconPNG))
}
