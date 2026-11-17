// SPDX-License-Identifier: GPL-3.0-or-later
// Linted with ESLint 9.39 (2026)

import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DiceActor, DIE_SIZE, PERCENT_DIE_SIZE, faceRange} from './dice.js';

const TUMBLE_MS = 1200;
const HOLD_MS = 1800;
const FADE_MS = 350;
const POP_MS = 250;
const DROP_PX = 260;
const FRAME_MS = 16;
const GAP = 12;
const LABEL_GAP = 8;
const CROWDED_SCALE = 0.8;

const FLICKER_MS = [45, 45, 50, 55, 65, 75, 90, 105, 125, 150, 180, 210];
const FLICKER_CALM_MS = [160, 190, 230, 280, 340, 420];

const easeOutQuad = t => 1 - (1 - t) * (1 - t);

function easeOutBounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1)
        return n1 * t * t;
    if (t < 2 / d1) {
        t -= 1.5 / d1;
        return n1 * t * t + 0.75;
    }
    if (t < 2.5 / d1) {
        t -= 2.25 / d1;
        return n1 * t * t + 0.9375;
    }
    t -= 2.625 / d1;
    return n1 * t * t + 0.984375;
}

export class Roller {
    constructor(settings) {
        this._settings = settings;
        this._faces = [];
        this._total = null;
        this._area = null;
        this._flickerId = 0;
        this._holdId = 0;
        this._tweenIds = new Set();
    }

    _reduceMotion() {
        if (this._settings.get_boolean('always-tumble'))
            return false;
        return !!St.ReducedMotion &&
            St.Settings.get().reducedMotion === St.ReducedMotion.REDUCE;
    }

    roll(sides, count = 1) {
        const reduceMotion = this._reduceMotion();
        const ball = sides === 100 && this._settings.get_string('d100-style') === 'ball';
        const percentile = sides === 100 && !ball;

        this._clear();

        const values = Array.from({length: count}, () => GLib.random_int_range(1, sides + 1));
        const total = values.reduce((sum, value) => sum + value, 0);
        const showTotal = count > 1 || percentile;

        const faces = this._createFaces(sides, values, percentile);
        this._faces = faces;

        for (const face of faces)
            Main.layoutManager.uiGroup.add_child(face.die);
        this._place(faces);
        for (const face of faces)
            face.die.setValue(this._randomValue(face));

        if (reduceMotion) {
            this._setOpacity(0);
            this._tween(200, t => this._setOpacity(Math.round(255 * t)));
            this._flicker(total, showTotal, FLICKER_CALM_MS, 0, false);
            return {values, total};
        }

        for (const face of faces) {
            face.spin = (GLib.random_int_range(0, 2) ? 1 : -1) *
                360 * GLib.random_int_range(2, 4);
        }

        const apply = t => {
            this._setOpacity(Math.round(255 * Math.min(1, t * TUMBLE_MS / 150)));
            const grow = t * TUMBLE_MS / 350;
            for (const face of faces) {
                if (grow < 1) {
                    const s = 0.5 + 0.5 * easeOutQuad(grow);
                    face.die.scale_x = s;
                    face.die.scale_y = s;
                }
                face.die.translation_y = -DROP_PX * (1 - easeOutBounce(t));
                face.die.rotation_angle_z = face.spin * easeOutQuad(t);
            }
        };
        apply(0);
        this._tween(TUMBLE_MS, apply);

        this._flicker(total, showTotal, FLICKER_MS, 0, true);
        return {values, total};
    }

    destroy() {
        this._clear();
    }

    _createFaces(sides, values, percentile) {
        const base = percentile ? PERCENT_DIE_SIZE : DIE_SIZE;
        const dieCount = percentile ? values.length * 2 : values.length;
        const monitor = this._monitor();
        const fit = Math.floor((monitor.width * 0.9 - (dieCount - 1) * GAP) / dieCount);
        const size = Math.min(fit, dieCount <= 2 ? base : Math.round(base * CROWDED_SCALE));

        const faces = [];
        const add = (dieSides, kind, final) => faces.push({
            die: new DiceActor(dieSides, {size, kind}),
            range: faceRange(dieSides, kind),
            final,
            size,
            shown: null,
            spin: 0,
        });

        for (const value of values) {
            if (percentile) {
                add(10, 'tens', value === 100 ? 0 : Math.floor(value / 10));
                add(10, 'units', value === 100 ? 0 : value % 10);
            } else {
                add(sides, 'normal', value);
            }
        }
        return faces;
    }

    _monitor() {
        const monitors = Main.layoutManager.monitors;
        return monitors[global.display.get_current_monitor()] ??
            Main.layoutManager.primaryMonitor;
    }

    _place(faces) {
        const monitor = this._monitor();

        const size = faces[0].size;
        const width = faces.length * size + (faces.length - 1) * GAP;
        const x = monitor.x + Math.floor((monitor.width - width) / 2);
        const y = monitor.y + Math.floor((monitor.height - size) / 2);

        faces.forEach((face, i) => face.die.set_position(x + i * (size + GAP), y));
        this._area = {x, y, width, height: size};
    }

    _randomValue(face) {
        const [lo, hi] = face.range;
        let value = GLib.random_int_range(lo, hi + 1);
        while (lo !== hi && value === face.shown)
            value = GLib.random_int_range(lo, hi + 1);
        face.shown = value;
        return value;
    }

    _setOpacity(opacity) {
        for (const face of this._faces)
            face.die.opacity = opacity;
        if (this._total)
            this._total.opacity = opacity;
    }

    _showTotal(total) {
        const label = new St.Label({
            style_class: 'roll-on-gnome-total',
            text: String(total),
            reactive: false,
        });
        Main.layoutManager.uiGroup.add_child(label);
        const [, width] = label.get_preferred_width(-1);
        label.set_position(
            Math.floor(this._area.x + (this._area.width - width) / 2),
            this._area.y + this._area.height + LABEL_GAP);
        this._total = label;
    }

    _tween(durationMs, step, done = null) {
        const start = GLib.get_monotonic_time();
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
            const elapsedMs = (GLib.get_monotonic_time() - start) / 1000;
            const t = Math.min(1, elapsedMs / durationMs);
            step(t);
            if (t < 1)
                return GLib.SOURCE_CONTINUE;
            this._tweenIds.delete(id);
            done?.();
            return GLib.SOURCE_REMOVE;
        });
        this._tweenIds.add(id);
    }

    _flicker(total, showTotal, delays, index, pop) {
        if (index >= delays.length) {
            this._flickerId = 0;
            for (const face of this._faces)
                face.die.setValue(face.final, true);
            if (showTotal)
                this._showTotal(total);
            if (pop) {
                this._tween(POP_MS, t => {
                    const s = 1 + 0.12 * Math.sin(Math.PI * t);
                    for (const face of this._faces) {
                        face.die.scale_x = s;
                        face.die.scale_y = s;
                    }
                });
            }
            this._startHold();
            return;
        }

        for (const face of this._faces)
            face.die.setValue(this._randomValue(face));

        this._flickerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delays[index], () => {
            this._flickerId = 0;
            this._flicker(total, showTotal, delays, index + 1, pop);
            return GLib.SOURCE_REMOVE;
        });
    }

    _startHold() {
        this._holdId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOLD_MS, () => {
            this._holdId = 0;
            this._tween(FADE_MS, t => this._setOpacity(Math.round(255 * (1 - t))),
                () => this._clear());
            return GLib.SOURCE_REMOVE;
        });
    }

    _clear() {
        if (this._flickerId) {
            GLib.Source.remove(this._flickerId);
            this._flickerId = 0;
        }
        if (this._holdId) {
            GLib.Source.remove(this._holdId);
            this._holdId = 0;
        }
        for (const id of this._tweenIds)
            GLib.Source.remove(id);
        this._tweenIds.clear();

        for (const face of this._faces)
            face.die.destroy();
        this._faces = [];

        this._total?.destroy();
        this._total = null;
        this._area = null;
    }
}
