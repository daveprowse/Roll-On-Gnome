// SPDX-License-Identifier: GPL-3.0-or-later
// Linted with ESLint 9.39 (2026)

import Cairo from 'gi://cairo';
import GObject from 'gi://GObject';
import St from 'gi://St';

export const DIE_SIZE = 180;
export const PERCENT_DIE_SIZE = 150;

const L = 0.28;
const M = 0.5;
const H = 0.72;

const PIPS = {
    1: [[M, M]],
    2: [[L, L], [H, H]],
    3: [[L, L], [M, M], [H, H]],
    4: [[L, L], [H, L], [L, H], [H, H]],
    5: [[L, L], [H, L], [M, M], [L, H], [H, H]],
    6: [[L, L], [L, M], [L, H], [H, L], [H, M], [H, H]],
};

const PALETTES = {
    4: {top: [0.15, 0.66, 0.6], bottom: [0.04, 0.34, 0.36]},
    6: {top: [0.88, 0.22, 0.2], bottom: [0.58, 0.08, 0.1]},
    8: {top: [0.9, 0.46, 0.1], bottom: [0.64, 0.24, 0.05]},
    10: {top: [0.68, 0.4, 0.9], bottom: [0.38, 0.15, 0.6]},
    12: {top: [0.2, 0.62, 0.3], bottom: [0.05, 0.37, 0.18]},
    20: {top: [0.4, 0.42, 0.95], bottom: [0.17, 0.12, 0.58]},
    tens: {top: [0.88, 0.3, 0.7], bottom: [0.55, 0.1, 0.45]},
    ball: {top: [0.95, 0.4, 0.78], bottom: [0.5, 0.06, 0.4]},
};

const CRIT = {top: [1.0, 0.86, 0.35], bottom: [0.8, 0.52, 0.08]};
const FUMBLE = {top: [0.4, 0.12, 0.16], bottom: [0.16, 0.03, 0.08]};

const rad = deg => deg * Math.PI / 180;
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const normalize = v => {
    const len = Math.sqrt(dot(v, v));
    return [v[0] / len, v[1] / len, v[2] / len];
};

export function faceRange(sides, kind) {
    return kind === 'normal' ? [1, sides] : [0, 9];
}

function roundedRect(cr, x, y, w, h, r) {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

function verticalGradient(y0, y1, palette) {
    const g = new Cairo.LinearGradient(0, y0, 0, y1);
    g.addColorStopRGBA(0, palette.top[0], palette.top[1], palette.top[2], 1);
    g.addColorStopRGBA(1, palette.bottom[0], palette.bottom[1], palette.bottom[2], 1);
    return g;
}

function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function convexHull(points) {
    const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
        while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
            lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (const p of pts.reverse()) {
        while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
            upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const RING_Z = 0.12;
const LIGHT = normalize([-0.35, -0.55, 0.75]);

function toView(p, yaw, pitch) {
    const cy = Math.cos(rad(yaw));
    const sy = Math.sin(rad(yaw));
    const x = p[0] * cy - p[1] * sy;
    const y = p[0] * sy + p[1] * cy;
    const cp = Math.cos(rad(pitch));
    const sp = Math.sin(rad(pitch));
    return [x, y * cp - p[2] * sp, y * sp + p[2] * cp];
}

function buildSolid(raw, yaw, pitch) {
    const allPoints = [];
    const faces = [];
    for (const {isTop, pts} of raw) {
        const centroid = [0, 1, 2].map(i => pts.reduce((sum, p) => sum + p[i], 0) / pts.length);
        let normal = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
        if (dot(normal, centroid) < 0)
            normal = normal.map(v => -v);
        const viewNormal = toView(normalize(normal), yaw, pitch);
        const flat = pts.map(p => {
            const v = toView(p, yaw, pitch);
            return [v[0], v[2]];
        });
        allPoints.push(...flat);
        if (viewNormal[1] < -0.02)
            faces.push({isTop, flat, normal: viewNormal});
    }

    const xs = allPoints.map(p => p[0]);
    const zs = allPoints.map(p => p[1]);
    const bounds = {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minZ: Math.min(...zs), maxZ: Math.max(...zs),
    };

    let labelFace = null;
    for (const face of faces) {
        if (face.isTop && (!labelFace || face.normal[1] < labelFace.normal[1]))
            labelFace = face;
    }

    return {faces, hull: convexHull(allPoints), bounds, labelFace};
}

function buildD10() {
    const c36 = Math.cos(rad(36));
    const apexZ = RING_Z * (1 + c36) / (1 - c36);
    const ring = (k, offset, z) => [
        Math.cos(rad(offset + 72 * k)), Math.sin(rad(offset + 72 * k)), z,
    ];

    const upper = [];
    const lower = [];
    for (let k = 0; k < 5; k++) {
        upper.push(ring(k, 0, RING_Z));
        lower.push(ring(k, 36, -RING_Z));
    }
    const top = [0, 0, apexZ];
    const bottom = [0, 0, -apexZ];

    const raw = [];
    for (let k = 0; k < 5; k++) {
        raw.push({isTop: true, pts: [top, upper[k], lower[k], upper[(k + 1) % 5]]});
        raw.push({isTop: false, pts: [bottom, lower[k], upper[(k + 1) % 5], lower[(k + 1) % 5]]});
    }
    return buildSolid(raw, 234, 25);
}

function buildD8() {
    const top = [0, 0, 1];
    const bottom = [0, 0, -1];
    const ring = k => [Math.cos(rad(90 * k)), Math.sin(rad(90 * k)), 0];

    const raw = [];
    for (let k = 0; k < 4; k++) {
        raw.push({isTop: true, pts: [top, ring(k), ring((k + 1) % 4)]});
        raw.push({isTop: false, pts: [bottom, ring(k), ring((k + 1) % 4)]});
    }
    return buildSolid(raw, 30, 28);
}

const D10 = buildD10();
const D8 = buildD8();

function drawSolid(cr, size, solid, label, palette) {
    const {faces, hull, bounds, labelFace} = solid;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    const scale = size * 0.86 / span;
    const midX = (bounds.maxX + bounds.minX) / 2;
    const midZ = (bounds.maxZ + bounds.minZ) / 2;
    const project = ([x, z]) => [size / 2 + scale * (x - midX), size / 2 - scale * (z - midZ)];

    cr.setLineJoin(Cairo.LineJoin.ROUND);

    cr.newPath();
    hull.forEach((p, k) => {
        const [x, y] = project(p);
        if (k === 0)
            cr.moveTo(x, y + size * 0.035);
        else
            cr.lineTo(x, y + size * 0.035);
    });
    cr.closePath();
    cr.setSourceRGBA(0, 0, 0, 0.35);
    cr.fill();

    for (const face of faces) {
        const t = clamp(0.5 + 0.55 * dot(face.normal, LIGHT), 0, 1);
        const color = mix(palette.bottom, palette.top, t);
        cr.newPath();
        face.flat.forEach((p, k) => {
            const [x, y] = project(p);
            if (k === 0)
                cr.moveTo(x, y);
            else
                cr.lineTo(x, y);
        });
        cr.closePath();
        cr.setSourceRGBA(color[0], color[1], color[2], 1);
        cr.fillPreserve();
        cr.setLineWidth(size * 0.012);
        cr.setSourceRGBA(1, 1, 1, 0.45);
        cr.stroke();
    }

    const poly = labelFace.flat.map(project);
    const n = poly.length;
    const cx = poly.reduce((sum, p) => sum + p[0], 0) / n;
    const cy = poly.reduce((sum, p) => sum + p[1], 0) / n;
    let area = 0;
    for (let i = 0; i < n; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % n];
        area += x1 * y2 - x2 * y1;
    }
    area = Math.abs(area) / 2;
    const factor = n === 3 ? 0.6 : 0.65;
    const fontSize = Math.min(size * 0.22, Math.sqrt(area) * (label.length > 1 ? factor * 0.74 : factor));
    drawLabel(cr, label, cx, cy, fontSize, [1, 1, 1], true);
}

const BALL_FACETS = (() => {
    const count = 100;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const points = [];
    for (let i = 0; i < count; i++) {
        const y = 1 - 2 * (i + 0.5) / count;
        const r = Math.sqrt(1 - y * y);
        const a = i * golden;
        points.push([r * Math.cos(a), y, r * Math.sin(a)]);
    }
    return points;
})();

function drawBall(cr, size, label, palette) {
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.46;

    cr.newPath();
    cr.arc(cx, cy + size * 0.035, R, 0, 2 * Math.PI);
    cr.setSourceRGBA(0, 0, 0, 0.35);
    cr.fill();

    const light = mix(palette.top, [1, 1, 1], 0.25);
    const g = new Cairo.RadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    g.addColorStopRGBA(0, light[0], light[1], light[2], 1);
    g.addColorStopRGBA(1, palette.bottom[0], palette.bottom[1], palette.bottom[2], 1);
    cr.newPath();
    cr.arc(cx, cy, R, 0, 2 * Math.PI);
    cr.setSource(g);
    cr.fillPreserve();
    cr.setLineWidth(size * 0.012);
    cr.setSourceRGBA(1, 1, 1, 0.45);
    cr.stroke();

    cr.newPath();
    for (const [x, y, z] of BALL_FACETS) {
        if (z <= 0.1)
            continue;
        cr.save();
        cr.translate(cx + R * 0.96 * x, cy - R * 0.96 * y);
        cr.rotate(Math.atan2(-y, x));
        cr.scale(z, 1);
        cr.newSubPath();
        cr.arc(0, 0, R * 0.16, 0, 2 * Math.PI);
        cr.restore();
    }
    cr.setSourceRGBA(1, 1, 1, 0.1);
    cr.fillPreserve();
    cr.setLineWidth(size * 0.007);
    cr.setSourceRGBA(1, 1, 1, 0.4);
    cr.stroke();

    cr.newPath();
    cr.arc(cx, cy, R * 0.34, 0, 2 * Math.PI);
    cr.setSourceRGBA(0, 0, 0, 0.38);
    cr.fill();

    const fontSize = size * (label.length > 2 ? 0.19 : label.length > 1 ? 0.24 : 0.3);
    drawLabel(cr, label, cx, cy, fontSize, [1, 1, 1], true);
}

function buildShape(sides, size) {
    const cx = size / 2;
    const cy = size / 2;

    if (sides === 4) {
        const R = size * 0.5;
        const oy = cy + R * 0.25;
        const v = [polar(cx, oy, R, -90), polar(cx, oy, R, 30), polar(cx, oy, R, 150)];
        return {
            outline: v,
            lines: v.map(p => [[cx, oy], p]),
            text: [cx, oy + size * 0.02, 0.26],
        };
    }

    if (sides === 12) {
        const R = size * 0.48;
        const oy = cy + R * 0.095;
        const outline = [];
        for (let k = 0; k < 5; k++)
            outline.push(polar(cx, oy, R, -90 + 72 * k));
        const inner = [];
        for (let k = 0; k < 5; k++)
            inner.push(polar(cx, oy, R * 0.5, 90 + 72 * k));
        const lines = [];
        for (let k = 0; k < 5; k++) {
            const angle = 90 + 72 * k;
            lines.push([inner[k], inner[(k + 1) % 5]]);
            lines.push([inner[k], polar(cx, oy, R, angle - 36)]);
            lines.push([inner[k], polar(cx, oy, R, angle + 36)]);
        }
        return {outline, lines, text: [cx, oy, 0.27]};
    }

    const R = size * 0.46;
    const outline = [];
    for (let k = 0; k < 6; k++)
        outline.push(polar(cx, cy, R, -90 + 60 * k));
    const tri = [];
    for (let k = 0; k < 3; k++)
        tri.push(polar(cx, cy, R * 0.56, -90 + 120 * k));
    const lines = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
    for (let k = 0; k < 3; k++) {
        lines.push([tri[k], outline[2 * k]]);
        lines.push([outline[2 * k + 1], tri[k]]);
        lines.push([outline[2 * k + 1], tri[(k + 1) % 3]]);
    }
    return {outline, lines, text: [cx, cy + size * 0.02, 0.27]};
}

function drawLabel(cr, text, cx, cy, fontSize, color, shadow) {
    cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
    cr.setFontSize(fontSize);
    const ext = cr.textExtents(text);
    const x = cx - (ext.width / 2 + ext.xBearing);
    const y = cy - (ext.height / 2 + ext.yBearing);
    if (shadow) {
        cr.moveTo(x + fontSize * 0.03, y + fontSize * 0.03);
        cr.setSourceRGBA(0, 0, 0, 0.4);
        cr.showText(text);
    }
    cr.moveTo(x, y);
    cr.setSourceRGBA(color[0], color[1], color[2], 1);
    cr.showText(text);
}

function drawD6(cr, size, value) {
    const pad = size * 0.1;
    const s = size - pad * 2;
    const r = s * 0.2;

    roundedRect(cr, pad, pad + size * 0.035, s, s, r);
    cr.setSourceRGBA(0, 0, 0, 0.35);
    cr.fill();

    roundedRect(cr, pad, pad, s, s, r);
    cr.setSource(verticalGradient(pad, pad + s, PALETTES[6]));
    cr.fillPreserve();
    cr.setLineWidth(size * 0.012);
    cr.setSourceRGBA(1, 1, 1, 0.45);
    cr.stroke();

    for (const [fx, fy] of PIPS[value]) {
        cr.arc(pad + s * fx, pad + s * fy, s * 0.085, 0, 2 * Math.PI);
        cr.setSourceRGBA(1, 1, 1, 0.95);
        cr.fill();
    }
}

function drawPolyDie(cr, size, sides, label, palette, style) {
    const shape = buildShape(sides, size);
    const crit = style === 'crit';

    const outlinePath = dy => {
        cr.newPath();
        shape.outline.forEach(([x, y], k) => {
            if (k === 0)
                cr.moveTo(x, y + dy);
            else
                cr.lineTo(x, y + dy);
        });
        cr.closePath();
    };

    cr.setLineJoin(Cairo.LineJoin.ROUND);

    outlinePath(size * 0.035);
    cr.setSourceRGBA(0, 0, 0, 0.35);
    cr.fill();

    const ys = shape.outline.map(p => p[1]);
    outlinePath(0);
    cr.setSource(verticalGradient(Math.min(...ys), Math.max(...ys), palette));
    cr.fillPreserve();
    cr.setLineWidth(size * (crit ? 0.025 : 0.012));
    cr.setSourceRGBA(1, 1, 1, crit ? 0.9 : 0.45);
    cr.stroke();

    cr.setLineWidth(size * 0.01);
    cr.setSourceRGBA(1, 1, 1, 0.35);
    cr.newPath();
    for (const [a, b] of shape.lines) {
        cr.moveTo(...a);
        cr.lineTo(...b);
    }
    cr.stroke();

    const [tx, ty, base] = shape.text;
    drawLabel(cr, label, tx, ty, size * base * (label.length > 1 ? 0.74 : 1),
        crit ? [0.28, 0.16, 0.0] : [1, 1, 1], !crit);
}

export const DiceActor = GObject.registerClass(
class RollOnGnomeDie extends St.DrawingArea {
    constructor(sides, {size = DIE_SIZE, kind = 'normal'} = {}) {
        super({width: size, height: size, reactive: false});
        this._sides = sides;
        this._kind = kind;
        this._value = faceRange(sides, kind)[0];
        this._settled = false;
        this.set_pivot_point(0.5, 0.5);
        this.connect('repaint', () => this._paint());
    }

    setValue(value, settled = false) {
        this._value = value;
        this._settled = settled;
        this.queue_repaint();
    }

    _label() {
        if (this._kind === 'tens')
            return String(this._value * 10).padStart(2, '0');
        return String(this._value);
    }

    _paint() {
        const cr = this.get_context();
        try {
            const [w, h] = this.get_surface_size();
            const size = Math.min(w, h);
            const label = this._label();

            if (this._sides === 6) {
                drawD6(cr, size, this._value);
            } else if (this._sides === 100) {
                drawBall(cr, size, label, PALETTES.ball);
            } else if (this._sides === 10) {
                drawSolid(cr, size, D10, label, this._kind === 'tens' ? PALETTES.tens : PALETTES[10]);
            } else if (this._sides === 8) {
                drawSolid(cr, size, D8, label, PALETTES[8]);
            } else {
                let style = 'normal';
                let palette = PALETTES[this._sides];
                if (this._sides === 20 && this._settled) {
                    if (this._value === 20) {
                        style = 'crit';
                        palette = CRIT;
                    } else if (this._value === 1) {
                        style = 'fumble';
                        palette = FUMBLE;
                    }
                }
                drawPolyDie(cr, size, this._sides, label, palette, style);
            }
        } finally {
            cr.$dispose();
        }
    }
});
