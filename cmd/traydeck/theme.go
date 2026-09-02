package main

import (
	"image"
	"image/color"

	"gioui.org/font/gofont"
	"gioui.org/layout"
	"gioui.org/op"
	"gioui.org/op/clip"
	"gioui.org/op/paint"
	"gioui.org/text"
	"gioui.org/unit"
	"gioui.org/widget/material"
)

// The panel deliberately mirrors the web UI's palette so the two halves of the
// app do not look like different products.
var (
	colBg       = color.NRGBA{R: 0x10, G: 0x13, B: 0x19, A: 0xff}
	colLine     = color.NRGBA{R: 0x28, G: 0x2c, B: 0x36, A: 0xff}
	colInk      = color.NRGBA{R: 0xe8, G: 0xea, B: 0xf0, A: 0xff}
	colInkSoft  = color.NRGBA{R: 0xa2, G: 0xa9, B: 0xbb, A: 0xff}
	colInkFaint = color.NRGBA{R: 0x6b, G: 0x72, B: 0x85, A: 0xff}
	colAccent   = color.NRGBA{R: 0x6e, G: 0xa8, B: 0xfe, A: 0xff}
	colAhead    = color.NRGBA{R: 0x6e, G: 0xa8, B: 0xfe, A: 0xff}
	colBehind   = color.NRGBA{R: 0xf0, G: 0xb8, B: 0x49, A: 0xff}
	colDirty    = color.NRGBA{R: 0xf0, G: 0x8c, B: 0x4b, A: 0xff}
	colConflict = color.NRGBA{R: 0xf2, G: 0x60, B: 0x7a, A: 0xff}
	colClean    = color.NRGBA{R: 0x5f, G: 0xd1, B: 0xa0, A: 0xff}
)

func newTheme() *material.Theme {
	th := material.NewTheme()
	th.Shaper = text.NewShaper(text.WithCollection(gofont.Collection()))
	th.Palette.Bg = colBg
	th.Palette.Fg = colInk
	th.Palette.ContrastBg = colAccent
	th.Palette.ContrastFg = colBg
	return th
}

// fill paints a solid rectangle over the current constraints.
func fill(gtx layout.Context, c color.NRGBA) layout.Dimensions {
	size := gtx.Constraints.Min
	defer clip.Rect{Max: size}.Push(gtx.Ops).Pop()
	paint.ColorOp{Color: c}.Add(gtx.Ops)
	paint.PaintOp{}.Add(gtx.Ops)
	return layout.Dimensions{Size: size}
}

// fillArea paints a rectangle of an explicit size, used for row backgrounds
// where the row's height is only known after laying out its contents.
func fillArea(ops *op.Ops, size image.Point, c color.NRGBA) {
	defer clip.Rect{Max: size}.Push(ops).Pop()
	paint.ColorOp{Color: c}.Add(ops)
	paint.PaintOp{}.Add(ops)
}

// rule draws a one-pixel horizontal separator.
func rule(gtx layout.Context) layout.Dimensions {
	h := gtx.Dp(unit.Dp(1))
	size := image.Pt(gtx.Constraints.Max.X, h)
	fillArea(gtx.Ops, size, colLine)
	return layout.Dimensions{Size: size}
}

// dot draws the small status circle that opens every row.
func dot(gtx layout.Context, c color.NRGBA) layout.Dimensions {
	d := gtx.Dp(unit.Dp(6))
	r := clip.RRect{
		Rect: image.Rectangle{Max: image.Pt(d, d)},
		NE:   d / 2, NW: d / 2, SE: d / 2, SW: d / 2,
	}
	defer r.Push(gtx.Ops).Pop()
	paint.ColorOp{Color: c}.Add(gtx.Ops)
	paint.PaintOp{}.Add(gtx.Ops)
	return layout.Dimensions{Size: image.Pt(d, d)}
}

// bar paints a filled rectangle at an offset. The worktree rail and its elbow
// are both drawn with it.
func bar(ops *op.Ops, x, y, w, h int, c color.NRGBA) {
	off := op.Offset(image.Pt(x, y)).Push(ops)
	fillArea(ops, image.Pt(w, h), c)
	off.Pop()
}
