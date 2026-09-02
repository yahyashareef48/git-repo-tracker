package main

import (
	"testing"

	"gioui.org/unit"
)

func TestSquareDpCommonScreens(t *testing.T) {
	cases := []struct {
		name    string
		widthPx int
		scale   float32
		want    unit.Dp
	}{
		{"1080p unscaled", 1920, 1, 320},
		// At 125% the window is opened in dp, so the side has to shrink or
		// Gio scales it back up and the square comes out 400 physical pixels.
		{"1080p at 125%", 1920, 1.25, minSquare}, // a sixth is 256, floored
		{"1440p unscaled", 2560, 1, 2560.0 / screenFraction},
		{"4k unscaled", 3840, 1, maxSquare},  // a sixth would be 640, capped
		{"small laptop", 1366, 1, minSquare}, // a sixth would be 227, floored
		{"windows said nothing", 0, 0, minSquare},
	}
	for _, c := range cases {
		if got := squareDp(c.widthPx, c.scale); got != c.want {
			t.Errorf("%s: squareDp(%d, %v) = %v, want %v", c.name, c.widthPx, c.scale, got, c.want)
		}
	}
}

func TestSquareStaysWidgetSized(t *testing.T) {
	for w := 800; w <= 7680; w += 37 {
		for _, scale := range []float32{1, 1.25, 1.5, 2} {
			got := squareDp(w, scale)
			if got < minSquare || got > maxSquare {
				t.Fatalf("squareDp(%d, %v) = %v, outside [%v, %v]", w, scale, got, minSquare, maxSquare)
			}
		}
	}
}

// The point of the whole exercise: whatever the scaling, the window lands a
// sixth of the screen wide in real pixels. The bounds override that, so this
// only asserts where a sixth is a sensible widget in the first place.
func TestSquareIsASixthInPhysicalPixels(t *testing.T) {
	for _, widthPx := range []int{1920, 2560, 3440} {
		for _, scale := range []float32{1, 1.25, 1.5, 2} {
			want := float32(widthPx) / screenFraction
			if dp := unit.Dp(want / scale); dp < minSquare || dp > maxSquare {
				continue // a bound decides this one, tested above
			}
			if gotPx := float32(squareDp(widthPx, scale)) * scale; gotPx < want-1 || gotPx > want+1 {
				t.Errorf("%dpx at %v: %v physical pixels, want %v", widthPx, scale, gotPx, want)
			}
		}
	}
}
