# How the exposure treatment works

## The light-table example

A dark film strip photographed against a very bright light table acts like a silhouette. In a double exposure, the second photograph can become visible within the dark strip while the surrounding background remains white. Midtones tend to combine rather than form a clean outline. ILFORD describes this technique in [Taking a Double Exposure](https://www.ilfordphoto.com/taking-a-double-exposure/) and [Photosynthesis: Blending Humans and Plant Textures In-Camera](https://www.ilfordphoto.com/photosynthesis-blending-humans-plant-textures-camera/).

The bright area does not physically block the next exposure. Light from both exposures reaches the same film. More exposure produces greater density in a developed negative; printing or scanning maps that density back to positive tones. Added detail may have little visible effect in a region already rendered close to white. Film stock, development, and printing or scanning affect that result. Kodak's [Basic Photographic Sensitometry Workbook](https://www.kodak.com/content/products-brochures/Film/Basic-Photographic-Sensitometry-Workbook.pdf) explains characteristic curves, their toe and shoulder, and the separate responses of negative film and paper.

## What underexposure means here

For two normally exposed pictures overlapping across the frame, reducing each by one stop is a common way to budget the total light: half plus half equals one normal exposure. [Canon's additive-exposure guide](https://my.canon/en/support/8204544200) gives this starting point. It is not a universal rule for every double-exposure composition.

For the silhouette technique, the crucial condition is a bright background and a dark subject in the same photograph. Automatically reducing the whole rendered photograph can turn its white background gray and allow the second image to become visible there. ILFORD's Photosynthesis example instead combines a blown white portrait background with texture photographs generally taken one stop under. The appropriate exposures depend on the images and the intended result.

## Exposure order and both photographs

For ordinary double exposures on undeveloped film, shooting order generally makes little difference to the blend. In the section "Worrying about the order of the exposures," [ILFORD's guest photographer](https://www.ilfordphoto.com/taking-a-double-exposure/) advises taking either the silhouette or subject first. Order independence follows from the approximate model of adding both exposures before applying the photographic response; it is not a claim that all film chemistry is perfectly independent of time or exposure conditions.

The website therefore reads the light values from both photographs at each matching position after alignment. These intended local relationships apply in either direction, though the amount of brightening differs between treatments:

| Photograph A at a position | Photograph B at that position | Resulting tendency |
| --- | --- | --- |
| Dark | Bright or detailed | B shows strongly |
| Bright or detailed | Dark | A shows strongly |
| Dark | Dark | Remains dark |
| Midtone | Midtone | Combine and become lighter |
| White | Any tone | White, at the current project settings |
| Any tone | White | White, at the current project settings |

The public mixer calculates continuous light contributions per colour channel; the saved smooth trial uses luminance for its exposure calculation and combines colour afterward; Revised smooth adjusts the local overlap after the saved single-source EV response. None needs to label whole objects or give a photograph priority. Numerical checks give the same result when the two aligned inputs and their EV settings are swapped. The base photograph defines the output frame; both full photographs fit inside it with black padding where needed. Swapping photographs with different aspect ratios can therefore change framing even though the pixel calculation is symmetric. Portraits rotate clockwise before fitting.

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

The supplied film curve remains selectable beside the fixed current-addition reference. Reducing both photographs by one stop can make a bright light-table base less able to hide the other photo and can dim the other photo inside dark film strips.

## Current addition with adjustable contrast

The default adjustable treatment is **Current + contrast**, beside the unchanged Current addition reference. Both use the existing additive pixel calculation in `scripts.js`. The right preview starts at contrast 12, with an artist-only slider from 0 to 30; the left remains at contrast zero. At zero contrast and matching EV/colour settings, they produce the same pixels. The renderer version remains `linear-addition-c6a65ba`, and the recipe records the selected value in `settings.contrast`.

The existing display-space contrast curve fixes black, white, and middle gray. Positive contrast makes darker tones darker and lighter tones lighter after addition; it does not use the smooth treatments' stronger local source suppression. This preserves Current's overlap operation while allowing its contrast to be judged separately. The adjustment can still compress subtle tones and cannot recover a channel already clipped by addition. It is an artistic tonal adjustment rather than a calibrated film response. Other treatments use neutral contrast and keep their existing algorithms. The public page remains unchanged.

The exact version before this change is saved as **`before-current-contrast-trial`** at **`67ec935`**. The contrast trial is a separate change that can be undone directly.

## The revised smooth trial

The selectable **Revised smooth** treatment remains beside the unchanged Current addition reference. It first applies the saved smooth single-source EV response separately to each luminance. If `M` is the brighter adjusted pixel and `m` the darker, it uses `h = 1 / (1 + (M / 0.23)^3.5)` and `Yout = min(1, M + m × h)`. This increases the contribution in dark and lower-midtone overlaps and limits it gradually in bright overlaps. The names brighter/darker do not give either source priority; swapping aligned inputs with their EV settings preserves the result.

For example, 40 + 40 changes from the saved smooth's 48 to 58, 80 + 128 from 130 to 140, and 128 + 128 from 144 to 157. Two bright values of 185 now produce 191 instead of 199; 200 + 200 produces 203 instead of 212. Colour dominance changes continuously, with more balanced weights in shadows and stronger brightness dominance in highlights. When both sources carry light, colour differences fade locally according to the remaining highlight headroom: `(1 − M)² / ((1 − M)² + m²)`. A source against black keeps its colour, while a bright neutral base can suppress a coloured overlay. Remaining excess RGB values are scaled together to fit the display; this can lower saturated colours' brightness. Black and white uses the luminances directly.

This is a visual overlap adjustment rather than a calibrated emulsion response or a physical sum of latent exposure. It preserves a single source against black at zero EV, while two half-exposure copies need not reconstruct the original tones. The previous code is preserved at `0d5a8ba`, whose tree matches `smooth-exposure-checkpoint` at `5887061`; the saved smooth option and its pixel results remain unchanged.

## The saved smooth-exposure trial

The saved **Smooth exposure** treatment remains selectable, starting at zero EV for each photograph. At each pixel it estimates exposure from linear luminance `Y` using `E(Y) = (0.98Y / (1 − 0.98Y))²`. Each photograph's EV scales its estimated exposure; the two estimates are added and developed using `Yout = min(1, √E / (0.98 × (1 + √E)))`. The 0.98 anchor keeps the white endpoint finite. The response reaches white continuously and uses every grayscale output value when a source is combined with black.

The purpose is to preserve more separation in dark areas. A dark pixel has little influence beside a brighter pixel: gray 35 plus gray 128 stays about 128, two gray-128 pixels become about 144, and gray 185 plus gray 128 becomes about 187 at 0/0 EV. Both photographs contribute according to the same rule, with no shooting-order priority or global opacity reduction. These values describe the chosen model, not measured film behaviour.

For colour, the two source chromaticities are weighted by estimated exposure and given one shared finished luminance. A common factor moves out-of-gamut colour toward neutral, avoiding the separate RGB threshold jumps that caused harsh colour patches in the rejected experiment. Monochrome uses the luminances directly. The model accepts both scans and digital photographs, but a finished upload does not reveal its original exposure or tone curve; this remains an artistic approximation requiring visual judgement.

The earlier threshold experiment was removed because its output jumped from 185 to 255 and clipped input detail before EV adjustment. The smooth trial has no equivalent middle-gray cutoff. [FILM-EXPERIMENT.md](FILM-EXPERIMENT.md) covers the controls, comparisons, result records, and the exact `exposure-checkpoint-2026-10-29` fallback at `f03ce10`. The public renderer and Google archive are unchanged.

## Camera modes

The Z fc offers Add, Average, Lighten, and Darken modes. Nikon documents Add as cumulative without gain adjustment and Average as reducing each exposure's gain; Lighten and Darken select brighter and darker pixels respectively. These are different operations. The current website uses bounded linear addition and does not claim to duplicate a particular camera mode. See [Nikon's multiple-exposure instructions](https://onlinemanual.nikonimglib.com/zfc/en/09-03-29.html).
