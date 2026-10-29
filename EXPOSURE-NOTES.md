# How the exposure treatment works

## The light-table example

A dark film strip photographed against a very bright light table acts like a silhouette. In a double exposure, the second photograph can become visible within the dark strip while the surrounding background remains white. Midtones tend to combine rather than form a clean outline. ILFORD describes this technique in [Taking a Double Exposure](https://www.ilfordphoto.com/taking-a-double-exposure/) and [Photosynthesis: Blending Humans and Plant Textures In-Camera](https://www.ilfordphoto.com/photosynthesis-blending-humans-plant-textures-camera/).

The bright area does not physically block the next exposure. Light from both exposures reaches the same film. More exposure produces greater density in a developed negative; printing or scanning maps that density back to positive tones. Added detail may have little visible effect in a region already rendered close to white. Film stock, development, and printing or scanning affect that result. Kodak's [Basic Photographic Sensitometry Workbook](https://www.kodak.com/content/products-brochures/Film/Basic-Photographic-Sensitometry-Workbook.pdf) explains characteristic curves, their toe and shoulder, and the separate responses of negative film and paper.

## What underexposure means here

For two normally exposed pictures overlapping across the frame, reducing each by one stop is a common way to budget the total light: half plus half equals one normal exposure. [Canon's additive-exposure guide](https://my.canon/en/support/8204544200) gives this starting point. It is not a universal rule for every double-exposure composition.

For the silhouette technique, the crucial condition is a bright background and a dark subject in the same photograph. Automatically reducing the whole rendered photograph can turn its white background gray and allow the second image to become visible there. ILFORD's Photosynthesis example instead combines a blown white portrait background with texture photographs generally taken one stop under. The appropriate exposures depend on the images and the intended result.

## Exposure order and both photographs

For ordinary double exposures on undeveloped film, shooting order generally makes little difference to the blend. In the section "Worrying about the order of the exposures," [ILFORD's guest photographer](https://www.ilfordphoto.com/taking-a-double-exposure/) advises taking either the silhouette or subject first. Order independence follows from the approximate model of adding both exposures before applying the photographic response; it is not a claim that all film chemistry is perfectly independent of time or exposure conditions.

The website therefore reads the light values from both photographs at each matching position after alignment. These local relationships describe the intended behaviour at neutral settings, although the amount of brightening differs by treatment:

| Photograph A at a position | Photograph B at that position | Resulting tendency |
| --- | --- | --- |
| Dark | Bright or detailed | B shows strongly |
| Bright or detailed | Dark | A shows strongly |
| Dark | Dark | Remains dark |
| Midtone | Midtone | Combine and become lighter |
| White | Any tone | White, at the current project settings |
| Any tone | White | White, at the current project settings |

The mixer calculates continuous light contributions per colour channel. It does not need to label whole objects or pick a winning photograph. A numerical check using the actual project settings gives the same result when the two aligned inputs are swapped. The base photograph defines the output frame; both full photographs fit inside it with black padding where needed. Swapping photographs with different aspect ratios can therefore change framing even though the pixel calculation is symmetric. Portraits rotate clockwise before fitting.

## The current restored baseline

The inverse-Reinhard response experiment was rolled back after reviewing the artist's actual analogue double exposures and website results. Its mathematical checks passed, but it did not produce the intended photographic appearance. The main website still uses the previous linear-addition treatment, which is also the fixed reference on the local comparison page:

```text
A = inverse_sRGB(base channel)
B = inverse_sRGB(participant channel)
light = min(1, 2^baseEV * A + 2^participantEV * B)
result = sRGB(light)
```

Each RGB channel is processed independently. An optional display-space contrast curve preserves the black and white endpoints. Monochrome uses linear luminance of the combined light values. The main settings remain zero EV for each photograph and neutral contrast. Black and white or colour is selected by the artist's `forceBlackAndWhite` option.

| Inputs, in 8-bit sRGB | Restored result |
| --- | --- |
| White + any colour at neutral exposure | White |
| Black + a photograph at neutral exposure | The photograph |
| Gray 128 + gray 128 at neutral exposure | Gray 176 |
| Two identical photographs at minus one stop each | The original tones |
| White + black, with the white photograph at minus one stop | Gray 188 |

This is a reproducible baseline, not a calibrated film simulation. It preserves the pure-white endpoint, but the way detail remains visible in bright grays and midtones still differs from the artist's references. Tests check the intended numerical operation and archive behaviour; they do not prove analogue fidelity.

The analogue references are `skull face` and `skull two face`. `Car_puddle (2)` and `Car_puddle (9)` are the single-exposure photographs used as website inputs. The two `double-exposure-test (2)` exports are website results. Comparisons must use these roles.

The final values in a scanned photograph reflect the film, development, scanning and digitization response, as described by [Debevec and Malik](https://www.pauldebevec.com/Research/HDR/debevec-siggraph97.pdf). Inverse sRGB alone does not recover that full response. A future model needs visual validation against the artist's examples before replacing this baseline.

## The separate film-curve experiment

`film-renderer.js` adapts the supplied `film.js` mathematics to browser RGBA pixels. It estimates each pixel's exposure using an assumed inverse response, scales each photograph by its own EV, adds those estimates, and applies the forward response. The supplied toe, shoulder, softness, and pure-white endpoint are preserved so the first comparison tests that actual proposal. Lookup tables are reused across exposure adjustments. The public renderer and Google archive flow are unchanged.

This model accepts both digital photographs and film scans. Neither source is guaranteed to match its assumed response. Its normalized density-shaped curve is used directly as positive brightness; it does not separately reconstruct the negative's transmission and the print or scan. It is not calibrated to a stock, developer, scanner, or capture duration. Colour is an approximation applying the same response separately to RGB channels. A technical caveat is the large exposure jump assigned to pure white compared with almost-white, which deserves review on real clipped highlights.

The film curve remains one choice on the local comparison page. Reducing both photographs by one stop can make a bright light-table base less able to hide the other photo and can dim the other photo inside dark film strips.

## The threshold exposure experiment

The local comparison page also offers a separate **Threshold exposure** treatment. It is the default adjustable result beside the fixed current-addition reference, both initially at zero EV. It is designed to test the artist's observation that a nearly black film strip should give the second image room to appear clearly while a bright light table should leave little of that image visible.

At each aligned pixel, the treatment converts each source's sRGB value to linear light and estimates a contribution to one shared exposure. The current experimental points are approximately 20/255 for no contribution and 185/255 for the bright endpoint, with a continuous curve between them. Each image's EV setting scales its estimated contribution. The contributions are added, capped at the bright endpoint, and converted into one finished pixel. Black and white uses each source's linear luminance; colour uses the same response separately on its red, green, and blue channels. The calculation is symmetric when the image positions and EV settings are exchanged.

This makes dark regions much less likely to turn the second photograph gray, and makes light regions lose its detail sooner than the public addition treatment. It does not set a global opacity or cut out a silhouette. It also does not recover the actual light that reached the film: a finished JPEG or film scan has already been altered by capture, development, scanning, and editing. The chosen points are artistic settings for comparison, not a measured characteristic curve or a guarantee that every pair will look like an analogue negative.

[FILM-EXPERIMENT.md](FILM-EXPERIMENT.md) covers the controls, comparisons, result records, and exact Git fallback.

## Camera modes

The Z fc offers Add, Average, Lighten, and Darken modes. Nikon documents Add as cumulative without gain adjustment and Average as reducing each exposure's gain; Lighten and Darken select brighter and darker pixels respectively. These are different operations. The current website uses bounded linear addition and does not claim to duplicate a particular camera mode. See [Nikon's multiple-exposure instructions](https://onlinemanual.nikonimglib.com/zfc/en/09-03-29.html).
