// Package trayicon builds the Windows tray icon, with and without the badge
// that marks unpushed work.
package trayicon

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"

	xdraw "golang.org/x/image/draw"
)

// size is the tray icon edge length. Windows scales from this happily and it
// keeps the embedded PNG small.
const size = 32

// Build renders the app icon as an .ico, optionally with a coloured dot in the
// corner. Windows has no per-app badge API, so the badge is drawn into the
// icon itself — the only way to show "you have unpushed work" from the tray.
func Build(src image.Image, badge bool) ([]byte, error) {
	canvas := image.NewRGBA(image.Rect(0, 0, size, size))
	xdraw.CatmullRom.Scale(canvas, canvas.Bounds(), src, src.Bounds(), draw.Over, nil)

	if badge {
		drawDot(canvas)
	}

	var payload bytes.Buffer
	if err := png.Encode(&payload, canvas); err != nil {
		return nil, err
	}
	return wrapICO(payload.Bytes()), nil
}

// drawDot paints a filled circle in the bottom-right, ringed in near-black so
// it stays visible against both light and dark taskbars.
func drawDot(img *image.RGBA) {
	const r = 9.0
	cx, cy := float64(size)-r-1, float64(size)-r-1

	fill := color.RGBA{R: 0x6e, G: 0xa8, B: 0xfe, A: 0xff}
	ring := color.RGBA{R: 0x0b, G: 0x0e, B: 0x14, A: 0xff}

	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			d := math.Hypot(float64(x)-cx, float64(y)-cy)
			switch {
			case d <= r-2.2:
				img.Set(x, y, fill)
			case d <= r:
				img.Set(x, y, ring)
			}
		}
	}
}

// wrapICO puts a PNG inside a single-image .ico container. Windows Vista and
// later read PNG-in-ICO directly, so no BMP conversion is needed.
func wrapICO(pngBytes []byte) []byte {
	var buf bytes.Buffer

	// ICONDIR: reserved, type 1 (icon), one image.
	binary.Write(&buf, binary.LittleEndian, uint16(0))
	binary.Write(&buf, binary.LittleEndian, uint16(1))
	binary.Write(&buf, binary.LittleEndian, uint16(1))

	// ICONDIRENTRY
	buf.WriteByte(size)                                            // width
	buf.WriteByte(size)                                            // height
	buf.WriteByte(0)                                               // palette size
	buf.WriteByte(0)                                               // reserved
	binary.Write(&buf, binary.LittleEndian, uint16(1))             // colour planes
	binary.Write(&buf, binary.LittleEndian, uint16(32))            // bits per pixel
	binary.Write(&buf, binary.LittleEndian, uint32(len(pngBytes))) // payload size
	binary.Write(&buf, binary.LittleEndian, uint32(6+16))          // payload offset

	buf.Write(pngBytes)
	return buf.Bytes()
}
