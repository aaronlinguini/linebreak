The most important finding from the research is that we can approximate analogue double exposures much more faithfully by simulating the accumulation of light on photographic film, pixel by pixel.

Your intuition about bright and dark areas is correct. Dark areas receive relatively little exposure, leaving room for another image to register. Bright areas receive substantial exposure and can overwhelm information from subsequent exposures.

ILFORD describes exactly this process in its article [Taking a Double Exposure](https://www.ilfordphoto.com/taking-a-double-exposure/?utm_source=chatgpt.com), using photographs taken with a Nikon FE, coincidentally.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.ilfordphoto.com\&sz=32)

Ilford Photo %



There is one technical distinction worth preserving: previously exposed highlights don't physically prevent additional photons from reaching the film. Both exposures contribute to the final latent image, and the film's nonlinear response determines how much detail survives.

## How the simulation should work

In analogue photography, the total exposure at each location on the negative is approximately:

\\[ H\_{\text{total}}(x,y)=H_1(x,y)+H_2(x,y) \\]

Here, \\(H\\) represents the quantity of light received by the film, and \\(x,y\\) identifies a particular location.

A simplified example illustrates what happens:

| First photograph  | Second photograph  | Combined effect                                         |
| ----------------- | ------------------ | ------------------------------------------------------- |
| Black silhouette  | Detailed landscape | Landscape registers strongly                            |
| Bright white sky  | Detailed landscape | Sky dominates; landscape may disappear                  |
| Mid-grey building | Mid-grey trees     | Both contribute, potentially producing a bright overlap |
| Almost black      | Almost black       | Little exposure; result stays dark                      |
| Bright sky        | Bright sky         | Very high exposure; highlight separation may be lost    |

The next step involves modelling how the film responds to that accumulated exposure.

Kodak's [Basic Photographic Sensitometry Workbook](https://www.kodak.com/content/products-brochures/Film/Basic-Photographic-Sensitometry-Workbook.pdf?utm_source=chatgpt.com) describes the characteristic curve of film, which has three important regions: the toe (low exposure), the straight-line region (middle exposure), and the shoulder (high exposure). These determine how exposure becomes density in the developed negative.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.kodak.com\&sz=32)

Kodak



This matters because two photographs can contribute different amounts of light at every pixel. A realistic simulation needs to preserve those differences while accounting for the loss of separation in underexposed shadows and heavily exposed highlights.

I’m building the first version around black-and-white negative film, with independently adjustable exposure for each photograph and a simulated film-response curve. It will keep the image-processing engine separate from the website interface, so its behaviour can be refined without rebuilding everything else.

## The working prototype

Download the complete Second Exposure website and program

The project includes a photographic gallery, an upload interface, adjustable exposure settings, random pairing with your collection, and automatic archiving.

View the image-processing algorithm

Read the detailed film research and technical explanation

Read the installation and customization guide

The simulation has three particularly important characteristics. It converts digital brightness into an estimated film exposure, accumulates light from both photographs at each pixel, and applies a nonlinear film-response curve. The exposure controls operate in photographic stops, so increasing one by +1 EV doubles its contribution.

For now, the characteristic curve represents generic black-and-white negative film. The next meaningful improvement would be calibrating it against a specific film stock, using measured characteristic curves and controlled scans. Kodak's research establishes why those curves differ, while ILFORD's reciprocity research demonstrates how exposure duration introduces further variation.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.kodak.com\&sz=32)

Kodak+1



The program has passed eight automated processing tests and an end-to-end test that generated and archived a photograph. Browser-level visual testing remains to be done.

To run it, open the unzipped folder in VS Code, run `npm install`, add your photographs to `photos/collection`, then run `npm start`. Visit `http://localhost:3000`.

The archive currently uses `data/archive`, where each successful exposure produces a PNG and a JSON record. This keeps your collection separate from participants' creations. Google Drive integration can come later, through the server. A public deployment will also need persistent storage and additional privacy and upload safeguards.

Most importantly, the entire processing engine is in `film.js`. You can inspect, challenge, modify, and experimentally test how every exposure is calculated.