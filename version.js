// SPDX-License-Identifier: GPL-3.0-or-later
// Linted with ESLint 9.39 (2026)

import {PACKAGE_VERSION} from 'resource:///org/gnome/shell/misc/config.js';

export const SHELL_MAJOR = Number.parseInt(PACKAGE_VERSION.split('.')[0], 10);
