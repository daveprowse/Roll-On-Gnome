# Roll On Gnome

Roll the dice on your GNOME™ desktop with **`Super+Alt+R`**. Includes d4, d6, d8, d10, d12, d20, percentile dice (2d10), and d100! Works on multi-monitor setups! 

*Designed for GNOME Shell 46-51.*

<!-- Add the extensions.gnome.org badge here once the extension is approved. -->

<!-- Add a demo GIF here, for example docs/demo.gif. -->

## Why this exists

I wanted a quick, honest, and fun way to make a random decision in front of other people while presenting.

It is also a companion to my other two presentation extensions, [Draw On Gnome](https://github.com/daveprowse/Draw-On-Gnome) and [Zoom In Gnome](https://github.com/daveprowse/Zoom-In-Gnome). While I originally wanted to include this in Draw On Gnome, that extension was getting big and multi-faceted, so dice rolling lives in its own small extension instead.

Roll On Gnome is built around four goals:

- **On the screen, not in a window.** The dice appear over whatever you are showing, on the monitor your pointer is on. Other monitors are untouched.
- **Stays out of the way.** The dice are a non-interactive overlay. They never take the keyboard or the mouse, so they *should* work alongside your other extensions without conflict.
- **One keystroke.** A shortcut opens the panel, so you do not have to hunt for a button while you are talking.
- **Small and plain.** The dice are drawn with Cairo, so there are no images, no web views, no network access and no dependencies. The whole package is tiny.

## Is there anything like it?

I looked in November, 2026 for existing dice rollers on Linux and for GNOME extensions. I found other dice rollers for Linux, but no current GNOME extension that rolls animated dice directly on the desktop, and nothing that did what I wanted. So, I think that this extension has value for GNOME enthusiasts.

Roll On Gnome is deliberately simple. It has no dice notation such as `2d6+3`, no modifiers and no 3D physics. The dice are flat drawings with a tumble animation. What it has is a roll that appears on the desktop in front of your audience in one keystroke.

## Features

- **Seven dice:** d4, d6, d8, d10, d12, d20 and d100.
- **Several dice at once:** set the number of dice (1 to 6) in the panel. Two d20 for advantage, four d6 for a stat, and so on. The total is shown under the dice.
- **Hotkeys for individual dice:** You can configure shortcuts in the settings to instantly roll a particular die.
- **Tumbling roll:** the dice drop in, bounce, spin and settle upright on the result.
- **Natural 20 and natural 1:** a d20 that lands on 20 turns gold (CRIT!). A natural 1 turns dark maroon (FUMBLE!).
- **Percentile dice:** a d100 rolls a tens die and a units die together and shows the total underneath, so "00" plus "0" is clearly 100. Or choose a single 100-sided ball in the preferences.
- **Recent rolls:** the panel remembers your last three rolls, such as `2d20 → 14 + 9 = 23`.
- **Multi-monitor aware:** the dice appear on the monitor where your pointer is.
- **Reduced Motion:** (optional) with the Reduced Motion setting on (GNOME Shell 51 and later), the dice roll in place with slowly changing faces instead of dropping and spinning. A preference lets you always play the full tumble.

## Shortcut

| Shortcut         | Action                                                |
| ---------------- | ----------------------------------------------------- |
| `Super+Alt+R`    | Open or close the dice panel                          |

You can change it in the preferences: click the shortcut, then press the keys you want. You can also open the panel from the dice icon in the top bar. Inside the panel, use the `-` and `+` buttons to set the number of dice, then click a die to roll. The arrow keys and Enter work too.

---
> **Note about shortcuts**: 
> A shortcut needs at least one modifier key (Super, Alt, Ctrl or Shift). Some extensions bind a plain `Super+R` (PaperWM does, for example), so check before choosing it. You can see what is already in use with:
> 
> ```bash
> gsettings list-recursively | grep -i "'<Super>r'"
> ```


## Compatibility

GNOME Shell **46 to 51**, on Wayland and X11.

Tested on:

- GNOME 46 (X11), Ubuntu 24.04
- GNOME 51 (Manjaro)

GNOME 47 to 50 should behave like their neighbors but have not been tested yet.

## Install

Download the zip from the [releases page](https://github.com/daveprowse/Roll-On-Gnome/releases) and install it:

```bash
gnome-extensions install --force roll-on-gnome@daveprowse.github.io.zip
```

A newly installed extension is only loaded by a fresh shell, so log out and back in. On X11 you can instead press `Alt+F2`, type `r` and press Enter. Then enable it:

```bash
gnome-extensions enable roll-on-gnome@daveprowse.github.io
```

Open the preferences with:

```bash
gnome-extensions prefs roll-on-gnome@daveprowse.github.io
```

## Good to know

- Results come from GLib's random number generator.
- The dice are drawn, not simulated. A roll always takes about the same time, and the result is chosen before the dice start moving.
- The shortcut is ignored while another full-screen tool, such as Draw On Gnome's drawing mode, has the keyboard.

## If something goes wrong

- **The preferences window shows an error about a missing key, or no dice appear:** the compiled schema in the install folder is out of date. Run `glib-compile-schemas` on the extension's `schemas` folder (or reinstall from the zip) and reload the shell.
- **Nothing happens when I press the shortcut:** another program or extension may own that key combination. Pick a different one in the preferences.
- **Look at the log:** problems are logged with the extension's ID:
  ```
  journalctl -b -o cat /usr/bin/gnome-shell | grep "roll-on-gnome"
  ```
- **Reporting a bug:** include your GNOME version, whether you are on Wayland or X11, how many monitors you have, and the log lines above.

## License

GPL-3.0-or-later. See `LICENSE`.

GNOME is a trademark of the GNOME Foundation. Roll On Gnome is an independent project and is not affiliated with or endorsed by the GNOME Foundation.