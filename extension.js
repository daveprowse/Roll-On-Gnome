// SPDX-License-Identifier: GPL-3.0-or-later
// Linted with ESLint 9.39 (2026)

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Roller} from './roller.js';

const SHORTCUT_KEY = 'toggle-panel';
const DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE = 6;
const HISTORY_SIZE = 3;

export default class RollOnGnomeExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._roller = new Roller(this._settings);
        this._history = [];
        this._count = 1;

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        const icon = new Gio.FileIcon({
            file: this.dir.get_child('icons').get_child('dice-symbolic.svg'),
        });
        this._indicator.add_child(new St.Icon({
            gicon: icon,
            style_class: 'system-status-icon',
        }));

        const menu = this._indicator.menu;
        const menuActor = menu.actor ?? menu._boxPointer;
        menuActor?.add_style_class_name('roll-on-gnome-menu');
        menu.box.add_style_class_name('roll-on-gnome-content');
        this._buildTitle(menu);
        this._buildStepper(menu);
        this._buildDiceItems(menu);
        this._buildHistory(menu);
        this._buildSettings(menu);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        const action = Main.wm.addKeybinding(
            SHORTCUT_KEY,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP,
            () => this._onShortcut());
        if (action === Meta.KeyBindingAction.NONE)
            console.error(`${this.uuid}: could not bind the shortcut; another program may already own it`);
    }

    disable() {
        Main.wm.removeKeybinding(SHORTCUT_KEY);

        this._roller?.destroy();
        this._roller = null;

        this._indicator?.destroy();
        this._indicator = null;
        this._dieItems = null;
        this._minusButton = null;
        this._plusButton = null;
        this._countLabel = null;
        this._historyHeader = null;
        this._historyItems = null;
        this._history = null;

        this._settings = null;
    }

    _buildTitle(menu) {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const box = new St.BoxLayout({x_expand: true, x_align: Clutter.ActorAlign.CENTER});
        box.add_child(new St.Icon({
            gicon: new Gio.FileIcon({file: this.dir.get_child('icons').get_child('gnome.svg')}),
            icon_size: 24,
            style_class: 'roll-on-gnome-title-icon',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Label({
            text: 'Roll On Gnome!',
            style_class: 'roll-on-gnome-title',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        item.add_child(box);
        menu.addMenuItem(item);
    }

    _buildSettings(menu) {
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const item = new PopupMenu.PopupMenuItem('Settings');
        item.connect('activate', () => this.openPreferences());
        menu.addMenuItem(item);
    }

    _buildStepper(menu) {
        const row = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        row.add_child(new St.Label({
            text: 'Number of dice',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this._minusButton = this._stepButton('−', () => this._setCount(this._count - 1));
        this._countLabel = new St.Label({
            text: String(this._count),
            style_class: 'roll-on-gnome-count',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._plusButton = this._stepButton('+', () => this._setCount(this._count + 1));

        row.add_child(this._minusButton);
        row.add_child(this._countLabel);
        row.add_child(this._plusButton);
        menu.addMenuItem(row);
        this._updateStepper();
    }

    _stepButton(text, onClick) {
        const button = new St.Button({
            label: text,
            style_class: 'roll-on-gnome-step',
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        button.connect('clicked', onClick);
        return button;
    }

    _buildDiceItems(menu) {
        this._dieItems = DICE.map(sides => {
            const name = sides === 100 ? 'Roll d100 (percentile)' : `Roll d${sides}`;
            const item = new PopupMenu.PopupMenuItem(name);
            item.connect('activate', () => this._roll(sides));
            menu.addMenuItem(item);
            return item;
        });
    }

    _buildHistory(menu) {
        this._historyHeader = new PopupMenu.PopupSeparatorMenuItem('Recent rolls');
        this._historyHeader.visible = false;
        menu.addMenuItem(this._historyHeader);

        this._historyItems = [];
        for (let i = 0; i < HISTORY_SIZE; i++) {
            const item = new PopupMenu.PopupMenuItem('', {reactive: false, can_focus: false});
            item.visible = false;
            menu.addMenuItem(item);
            this._historyItems.push(item);
        }
    }

    _setCount(count) {
        this._count = Math.min(MAX_DICE, Math.max(1, count));
        this._updateStepper();
    }

    _updateStepper() {
        this._countLabel.text = String(this._count);
        this._minusButton.opacity = this._count > 1 ? 255 : 110;
        this._plusButton.opacity = this._count < MAX_DICE ? 255 : 110;
    }

    _onShortcut() {
        const menu = this._indicator.menu;

        if (Main.modalCount > 0 && !menu.isOpen)
            return;

        menu.toggle();
        if (menu.isOpen)
            this._dieItems[0].grab_key_focus();
    }

    _roll(sides) {
        const count = this._count;
        const {values, total} = this._roller.roll(sides, count);

        this._history.unshift({sides, count, values, total});
        this._history.length = Math.min(this._history.length, HISTORY_SIZE);

        this._historyHeader.visible = true;
        this._historyItems.forEach((item, i) => {
            const entry = this._history[i];
            item.visible = !!entry;
            if (entry)
                item.label.text = this._describe(entry);
        });
    }

    _describe({sides, count, values, total}) {
        if (count === 1)
            return `d${sides} → ${total}`;
        return `${count}d${sides} → ${values.join(' + ')} = ${total}`;
    }
}
