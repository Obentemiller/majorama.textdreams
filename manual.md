# Majorama.textdreams Manual

> Prefer a guided tour? Tap **? Help** in the top bar (on mobile, in the bottom bar). The tutorial adapts to the screen you're on.

Majorama.sonho is a "DeepDream for an LLM": a vision model **describes** the regions of your image, and this site fills each region with its **own description**, in colored ASCII. Everything runs in your browser; nothing is sent anywhere.

## 1. The screen

- **Top bar:** `Home` (returns to the intro), the main button (it changes with each step: *Create the art*, *I already have the result*, *Generate*), `Panel` (opens/closes the input) and `? Help`. `FPS` shows the speed of the background animation.
- **Stage (left):** on the intro and guide screens, it shows the animated background; on the generation screen, it shows your art. **Click the art** to toggle between "fit to screen" and "actual size".
- **Panel (right):** the input (image, JSON, world, columns) and the generate and download buttons. Drag the **divider** to resize it (arrow keys work too; double-click restores it). On a portrait phone, it becomes a drawer at the bottom.
- **Console:** program messages (errors, warnings, generation time).

## 2. How to use it

1. **Intro.** Read the history of DeepDream and what changes here. Click **Create the art**.
2. **Guide.** Click **Copy the prompt**. Open a vision-capable LLM (preferably Claude), paste the prompt, attach **the image**, and send. The response comes back as a JSON code block. Copy it in full. Click **I already have the result**.
3. **Generate.**
   1. *Image:* choose (or drop) **the same image** you showed the LLM. PNG, JPG, WebP, GIF (first frame), BMP or AVIF, up to 25 MB / 80 megapixels.
   2. *LLM response:* paste the JSON. It may come with text around it and with the ```` ```json ```` fence: the program finds the JSON on its own. Below the field, `✓ N regions` or the reason for the error appears.
   3. *The world:* **Black world** (only the colored letters) or **Image color** (each cell's background takes the tone of the photo). Switching the world does **not** require generating again.
   4. *Columns:* 80 to 200. More columns = more detail and more time.
   5. **Generate** (or `Ctrl+Enter` in the JSON field).
4. **Take the art.** `Download .txt` (plain text, no color) or `Download .png` (with colors and the chosen world).

**Example button:** loads a landscape drawn on the spot and a ready-made JSON, so you can see the result without needing an LLM.

## 3. What the program does with the JSON

- Each region has `bbox` (box in %), `z` (layer: the higher one is in front), `color` and `desc`.
- The box is only a **hint**: the real shape comes from the image color inside and around the box.
- The outline is made of `/ \ | -`. Inside, the description repeats to fill the area.
- A narrow, tall area is written vertically; a wide, short one, horizontally.
- If the description doesn't fit, letters disappear scattered: **vowels first**, then consonants and spaces together.
- Colors and shadows come from the original image.

## 4. Common problems

| Symptom | Probable cause |
|---|---|
| `No JSON found in this response` | You copied only the explanatory text; copy the whole code block. |
| `The JSON is incomplete` | The LLM response was cut off. Ask it to "continue" or redo it and paste everything. |
| `The JSON has a syntax error` | A missing comma or swapped quotes. Ask the LLM to return only the valid JSON block. |
| `Too many regions` | Maximum of 64 regions. The prompt asks for 6 to 20. |
| A region "disappeared" or became something else | The LLM's box/color doesn't match the image. Check that it's **the same image** and that `color` is the region's real color. |
| Too many letters, a mess | Long description in a small area: pieces disappear on purpose. Use more columns or shorter descriptions (the important part first). |
| `Unsupported format` | The file isn't an accepted image (SVG is rejected on purpose). |
| `Took too long` | Reduce the columns or use a smaller image. |
| The Paste button doesn't work | The browser blocked clipboard access: click the field and use `Ctrl+V`. |
| Background animation is frozen | Your system asks to "reduce motion": the background stays on a single frame. |

## 5. Privacy and security

- The image and the JSON **stay in your browser**. The page blocks, through a security policy (CSP), any network connection and any script other than the project's own.
- The image type is checked by its bytes, not by its name. The LLM's text only becomes drawn letters; it is never interpreted as code or HTML.
- Downloaded files have fixed names (`sonho-profundo.txt` / `.png`).

## 6. Known limits

- **It is not the DeepDream algorithm:** no pixel is altered by gradient. It's the same idea, "the machine showing what it sees", just in words.
- The segmenter is a heuristic (LLM box + actual color). Thin regions, regions very similar in color, or very wrong boxes may come out imprecise.
- The LLM only **describes**; the script does the drawing. So the result is standardized, but it depends on the quality of the boxes and colors the LLM returns.
- Static images only (GIF uses its first frame). Video is not supported yet.
- The intro animation is preprogrammed: it's an illustration of how the LLM "describes", not a real run.
