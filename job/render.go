package job

import (
  "strings"
  "golang.org/x/image/math/fixed"
  "golang.org/x/image/font"
  "os"
  "image"
  "image/jpeg"
  "github.com/disintegration/gift"
  "github.com/lucasb-eyer/go-colorful"
  "github.com/pkg/errors"
  "image/draw"
  "github.com/golang/freetype"
  "github.com/golang/freetype/truetype"
)

func LoadFontFace(filename string, fontSize float64) (font.Face, error) {
  ttf, err := freetype.ParseFont(MustAsset(filename))
  if err != nil {
    return nil, errors.WithMessage(err, "Could not parse font file")
  }

  return truetype.NewFace(ttf, &truetype.Options{
    Size:    fontSize,
    DPI:     72,
    Hinting: font.HintingFull,
  }), nil
}

func RenderSubtitles(filename string, ff font.Face, fontSize float64, subtitles []Subtitle) error {
  fp, err := os.OpenFile(filename, os.O_RDWR, 0644)
  if err != nil {
    return errors.WithMessage(err, "Could not open image file")
  }

  defer fp.Close()

  bgImage, _, err := image.Decode(fp)
  if err != nil {
    return errors.WithMessage(err, "Could not read decode image")
  }

  // create a new blank canvas we can draw on
  bounds := bgImage.Bounds()
  textImage := image.NewRGBA(bounds)

  // font drawer for drawing and measuring
  drawer := font.Drawer{Dst: textImage, Face: ff}

  for _, subtitle := range subtitles {
    // draw each of the subtitles
    renderSubtitle(subtitle, fontSize, drawer)
  }

  // compose images into target image.
  targetImage := composeTargetImage(bgImage, textImage, fontSize);

  // clean the file, so we can rewrite it with the new jpeg
  if err := fp.Truncate(0); err != nil {
    return errors.WithMessage(err, "Could not truncate the image file")
  }

  if _, err := fp.Seek(0, os.SEEK_SET); err != nil {
    return errors.WithMessage(err, "Could not reset the file pointer in the image file.")
  }

  // now write the jpeg file
  if err := jpeg.Encode(fp, targetImage, &jpeg.Options{Quality: 98}); err != nil {
    return errors.WithMessage(err, "Could not encode the jpeg file.")
  }

  // fine!
  return nil
}

func composeTargetImage(bgImage image.Image, textImage image.Image, fontSize float64) image.Image {
  bounds := bgImage.Bounds()
  targetImage := image.NewRGBA(bounds)

  // draw background, outline and text.
  draw.Draw(targetImage, bounds, bgImage, image.ZP, draw.Src)

  outlineFilter := gift.New(
    gift.GaussianBlur(float32(0.025 * fontSize)),
    gift.ColorFunc(func(r, g, b, a float32) (float32, float32, float32, float32) {
      if a > 0 {
        return 0, 0, 0, 1
      } else {
        return 0, 0, 0, 0
      }
    }),
  )

  outlineFilter.DrawAt(targetImage, textImage, image.ZP, gift.OverOperator)
  draw.Draw(targetImage, bounds, textImage, image.ZP, draw.Over)

  return targetImage
}

func renderSubtitle(subtitle Subtitle, fontSize float64, drawer font.Drawer) {
  bounds := drawer.Dst.Bounds()
  iFontSize := fixed.Int26_6(int(fontSize * (1 << 6)))
  marginX := bounds.Dx() / 20
  marginY := bounds.Dy() / 10

  // set the color for this subtitle
  if col, err := colorful.Hex(subtitle.Color); err == nil {
    drawer.Src = image.NewUniform(col)
  } else {
    drawer.Src = image.White
  }

  // split the text into lines
  lines := strings.Split(subtitle.Text, "\n")
  lineCount := len(lines)

  var x, y fixed.Int26_6

  // from the number of lines we can calculate the first y position
  switch subtitle.Position.Y {
  case "top":
    y = fixed.I(marginY) + iFontSize

  case "bottom":
    y = fixed.I(bounds.Dy() - marginY) - iFontSize.Mul(fixed.I(lineCount - 1))

  // case "center":
  default:
    y = (fixed.I(bounds.Dy()) - iFontSize.Mul(fixed.I(lineCount))) / 2 + iFontSize
  }

  for idx, line := range lines {
    // do not paint empty lines.
    if strings.TrimSpace(line) == "" {
      continue
    }

    // calculate width of this line
    width := drawer.MeasureString(line)

    switch subtitle.Position.X {
    case "left":
      x = fixed.I(marginX)

    case "right":
      x = fixed.I(bounds.Dx() - marginX) - width

    // case "center":
    default:
      x = (fixed.I(bounds.Dx()) - width) / 2
    }

    // now draw this line
    drawer.Dot.X = x
    drawer.Dot.Y = fixed.I(idx).Mul(iFontSize) + y
    drawer.DrawString(line)
  }
}

