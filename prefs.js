// SPDX-License-Identifier: GPL-3.0-or-later
// Linted with ESLint 9.39 (2026)

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SHORTCUT_KEY = 'toggle-panel';
const DICE = [4, 6, 8, 10, 12, 20, 100];
const D100_STYLES = ['pair', 'ball'];
const ALL_KEYS = [SHORTCUT_KEY, ...DICE.map(sides => `roll-d${sides}`)];
const MONITOR_KEY = 'dice-monitor';
const AUTHOR = 'Dave Prowse';
const LICENSE = 'GPL-3.0-or-later';

export default class RollOnGnomePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        window.add(this._buildGeneralPage(settings));
        window.add(this._buildAboutPage());

        window.connect('close-request', () => {
            delete window._settings;
        });
    }

    _buildGeneralPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });

        const group = new Adw.PreferencesGroup({title: 'Shortcut'});
        group.add(this._shortcutRow(settings, SHORTCUT_KEY, 'Open dice panel'));
        const floating = new Adw.SwitchRow({
            title: 'Open the panel at the pointer',
            subtitle: 'Off: the panel drops from the top bar.',
        });
        settings.bind('panel-at-pointer', floating, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(floating);
        page.add(group);

        const quickGroup = new Adw.PreferencesGroup({
            title: 'Quick roll',
            description: 'Roll a die straight away, without opening the panel. ' +
                'Uses the number of dice set in the panel.',
        });
        DICE.forEach(sides => {
            quickGroup.add(this._shortcutRow(settings, `roll-d${sides}`, `Roll d${sides}`));
        });
        page.add(quickGroup);

        const diceGroup = new Adw.PreferencesGroup({title: 'Dice'});
        const styleRow = new Adw.ComboRow({
            title: 'd100 style',
            subtitle: 'Two d10 dice, or one ball.',
            model: Gtk.StringList.new(['Percentile pair', 'Single ball']),
        });
        styleRow.set_selected(Math.max(0, D100_STYLES.indexOf(settings.get_string('d100-style'))));
        styleRow.connect('notify::selected', () => {
            settings.set_string('d100-style', D100_STYLES[styleRow.get_selected()]);
        });
        diceGroup.add(styleRow);
        diceGroup.add(this._buildMonitorRow(settings));
        page.add(diceGroup);

        const motionGroup = new Adw.PreferencesGroup({title: 'Animation'});
        const tumble = new Adw.SwitchRow({
            title: 'Always play the full tumble',
            subtitle: 'Ignore the system Reduced Motion setting (Shell 51 and later). ' +
                'Otherwise the die rolls in place with slowly changing faces.',
        });
        settings.bind('always-tumble', tumble, 'active', Gio.SettingsBindFlags.DEFAULT);
        motionGroup.add(tumble);
        page.add(motionGroup);

        return page;
    }

    _buildMonitorRow(settings) {
        const saved = settings.get_string(MONITOR_KEY);
        const entries = [{connector: '', label: 'Monitor under the pointer'}];

        const monitors = Gdk.Display.get_default()?.get_monitors();
        const count = monitors ? monitors.get_n_items() : 0;
        for (let i = 0; i < count; i++) {
            const monitor = monitors.get_item(i);
            const connector = monitor.get_connector();
            if (!connector)
                continue;
            const model = monitor.get_model();
            entries.push({connector, label: model ? `${connector} (${model})` : connector});
        }
        if (saved && !entries.some(entry => entry.connector === saved))
            entries.push({connector: saved, label: `${saved} (not connected)`});

        const row = new Adw.ComboRow({
            title: 'Show dice on',
            subtitle: 'Which monitor the dice appear on.',
            model: Gtk.StringList.new(entries.map(entry => entry.label)),
        });
        row.set_selected(Math.max(0, entries.findIndex(entry => entry.connector === saved)));
        row.connect('notify::selected', () => {
            settings.set_string(MONITOR_KEY, entries[row.get_selected()].connector);
        });
        return row;
    }

    _shortcutRow(settings, key, title) {
        const row = new Adw.ActionRow({
            title,
            subtitle: 'Click, then press the new shortcut.',
            activatable: true,
        });

        const label = new Gtk.ShortcutLabel({
            accelerator: settings.get_strv(key)[0] ?? '',
            disabled_text: 'Disabled',
            valign: Gtk.Align.CENTER,
        });
        row.add_suffix(label);

        const reset = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Reset to default',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        reset.connect('clicked', () => settings.reset(key));
        row.add_suffix(reset);

        const changedId = settings.connect(`changed::${key}`, () => {
            label.set_accelerator(settings.get_strv(key)[0] ?? '');
        });
        row.connect('destroy', () => settings.disconnect(changedId));

        row.connect('activated', () => this._captureShortcut(row.get_root(), settings, key));
        return row;
    }

    _captureShortcut(parent, settings, key) {
        const dialog = new Gtk.Window({
            title: 'Set shortcut',
            modal: true,
            transient_for: parent,
            resizable: false,
            default_width: 380,
        });
        dialog.set_child(new Adw.StatusPage({
            icon_name: 'input-keyboard-symbolic',
            title: 'Press a shortcut',
            description: 'Hold the modifier keys and press a key.\n' +
                'Esc cancels, Backspace disables the shortcut.',
        }));

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask();

            if (mask === 0 && keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
                settings.set_strv(key, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }

            const lower = Gdk.keyval_to_lower(keyval);
            if (mask !== 0 && Gtk.accelerator_valid(lower, mask)) {
                const accel = Gtk.accelerator_name(lower, mask);
                for (const other of ALL_KEYS) {
                    if (other !== key && settings.get_strv(other)[0] === accel)
                        settings.set_strv(other, []);
                }
                settings.set_strv(key, [accel]);
                dialog.close();
            }
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(keys);

        dialog.connect('map', () => {
            const surface = dialog.get_surface();
            if (surface instanceof Gdk.Toplevel)
                surface.inhibit_system_shortcuts(null);
        });

        dialog.present();
    }

    _buildAboutPage() {
        const metadata = this.metadata;

        const page = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic',
        });

        const info = new Adw.PreferencesGroup({
            title: metadata.name,
            description: metadata.description,
        });
        const rows = [
            ['Version', metadata['version-name'] ?? ''],
            ['Author', AUTHOR],
            ['License', LICENSE],
        ];
        for (const [title, value] of rows)
            info.add(new Adw.ActionRow({title, subtitle: value}));
        page.add(info);

        if (metadata.url) {
            const links = new Adw.PreferencesGroup({title: 'Links'});
            links.add(this._linkRow('Project page', metadata.url));
            links.add(this._linkRow('Report an issue', `${metadata.url}/issues`));
            page.add(links);
        }

        return page;
    }

    _linkRow(title, uri) {
        const row = new Adw.ActionRow({title, subtitle: uri, activatable: true});
        row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        row.connect('activated', () => {
            try {
                Gio.AppInfo.launch_default_for_uri(uri, null);
            } catch (e) {
                console.error(`${this.uuid}: could not open ${uri}: ${e.message}`);
            }
        });
        return row;
    }
}
