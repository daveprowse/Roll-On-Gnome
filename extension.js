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
import {SHELL_MAJOR} from './version.js';

const SHORTCUT_KEY = 'toggle-panel';
const DICE = [4, 6, 8, 10, 12, 20, 100];
const ROLL_KEYS = DICE.map(sides => `roll-d${sides}`);
const MAX_DICE = 6;
const HISTORY_SIZE = 3;
const POINTER_KEY = 'panel-at-pointer';
const POINTER_GAP = 14;

export default class RollOnGnomeExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._roller = new Roller(this._settings);
        this._history = [];
        this._count = 1;

        this._indicator = new PanelMenu.Button(0.5, this.metadata.name, false);
        const icon = new Gio.FileIcon({
            file: this.dir.get_child('icons').get_child('dice-symbolic.svg'),
        });
        this._indicator.add_child(new St.Icon({
            gicon: icon,
            style_class: 'system-status-icon',
        }));

        const menu = this._indicator.menu;
        const menuActor = menu.actor;
        menuActor.add_style_class_name('roll-on-gnome-menu');
        menu.box.add_style_class_name('roll-on-gnome-content');
        this._buildTitle(menu);
        this._buildStepper(menu);
        this._buildDiceItems(menu);
        this._buildHistory(menu);
        this._buildSettings(menu);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // The menu is anchored to this invisible 1px actor when it opens at the pointer.
        // It sits just below the menu in the stacking order so it is laid out first.
        this._anchor = new St.Widget({width: 1, height: 1, opacity: 0, reactive: false});
        if (menuActor.get_parent() === Main.uiGroup)
            Main.uiGroup.insert_child_below(this._anchor, menuActor);
        else
            Main.uiGroup.add_child(this._anchor);

        // Move the menu back under the top bar icon only once it has finished closing,
        // otherwise it visibly jumps while it fades out.
        const pointer = menu.actor;
        this._pointer = pointer;
        this._hiddenId = pointer.connect('notify::visible', () => {
            if (!pointer.visible) {
                menu.sourceActor = this._indicator;
                this._setArrowSide(menu, St.Side.TOP);
                this._refreshHistory();
            }
        });

        const action = Main.wm.addKeybinding(
            SHORTCUT_KEY,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP,
            () => this._onShortcut());
        if (action === Meta.KeyBindingAction.NONE)
            console.error(`${this.uuid}: could not bind the shortcut; another program may already own it`);

        DICE.forEach((sides, i) => {
            Main.wm.addKeybinding(
                ROLL_KEYS[i],
                this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP,
                () => this._onQuickRoll(sides));
        });
    }

    disable() {
        Main.wm.removeKeybinding(SHORTCUT_KEY);
        ROLL_KEYS.forEach(key => Main.wm.removeKeybinding(key));

        this._roller?.destroy();
        this._roller = null;

        if (this._hiddenId)
            this._pointer?.disconnect(this._hiddenId);
        this._hiddenId = 0;
        this._pointer = null;
        this._anchor?.destroy();
        this._anchor = null;

        this._indicator?.destroy();
        this._indicator = null;
        this._dieItems = null;
        this._minusButton = null;
        this._plusButton = null;
        this._countLabel = null;
        this._historyHeader = null;
        this._historyItems = null;
        this._history = null;
        this._historyDirty = false;

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
        item.connect('activate', () => this._openPreferences());
        menu.addMenuItem(item);
    }

    async _openPreferences() {
        try {
            await Main.extensionManager.openExtensionPrefs(this.uuid, '', {});
        } catch (e) {
            console.error(`${this.uuid}: could not open preferences: ${e.message}`);
        }
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
        button.connect('key-press-event', (actor, event) => this._onStepKey(actor, event));
        return button;
    }

    _onStepKey(actor, event) {
        const directions = {
            [Clutter.KEY_Up]: St.DirectionType.UP,
            [Clutter.KEY_Down]: St.DirectionType.DOWN,
            [Clutter.KEY_Left]: St.DirectionType.LEFT,
            [Clutter.KEY_Right]: St.DirectionType.RIGHT,
        };
        const direction = directions[event.get_key_symbol()];
        if (direction === undefined)
            return Clutter.EVENT_PROPAGATE;

        const group = global.focus_manager.get_group(actor);
        return group?.navigate_focus(actor, direction, true)
            ? Clutter.EVENT_STOP
            : Clutter.EVENT_PROPAGATE;
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

        if (menu.isOpen) {
            menu.close();
            return;
        }

        const atPointer = this._settings.get_boolean(POINTER_KEY);
        if (atPointer) {
            const [x, y] = global.get_pointer();
            this._anchor.set_position(x + POINTER_GAP, y);
            menu.sourceActor = this._anchor;
            this._setArrowSide(menu, St.Side.LEFT);
        }
        menu.open();
        if (atPointer)
            this._indicator.remove_style_pseudo_class('active');
        this._dieItems[0].grab_key_focus();
    }

    // At the pointer the menu sits beside it (arrow on the left), because the shell
    // keeps a side-arrow menu inside the monitor vertically. A menu below the pointer
    // can run off the bottom of the screen as the recent-rolls list grows.
    _setArrowSide(menu, side) {
        const pointer = menu.actor;
        // Before Shell 50, updateArrowSide() did not update the side the shell flips from.
        if (SHELL_MAJOR < 50)
            pointer._userArrowSide = side;
        pointer.updateArrowSide(side);
    }

    _onQuickRoll(sides) {
        if (Main.modalCount > 0 && !this._indicator.menu.isOpen)
            return;

        this._indicator.menu.close();
        this._roll(sides);
    }

    _roll(sides) {
        const count = this._count;
        const {values, total} = this._roller.roll(sides, count);

        this._history.unshift({sides, count, values, total});
        this._history.length = Math.min(this._history.length, HISTORY_SIZE);
        this._historyDirty = true;

        // The list changes the menu's height, so wait until the menu is hidden
        // rather than make it move while it is on screen.
        if (!this._pointer?.visible)
            this._refreshHistory();
    }

    _refreshHistory() {
        if (!this._historyDirty || !this._historyItems)
            return;
        this._historyDirty = false;

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
