#!/usr/bin/env python3
"""Convert v2/ JSX files (window globals pattern) to Vite ES modules."""

import re, sys, os

# Map from data variable name → the module file that exports it
DATA_SOURCES = {
    # shell.jsx exports
    'MOD2': 'shell', 'modByKey': 'shell', 'Nav2Ctx': 'shell', 'useNav2': 'shell',
    'Pill': 'shell', 'Hr': 'shell', 'ModDot2': 'shell', 'Spark2': 'shell',
    'useClock': 'shell', 'useHeartbeat': 'shell', 'fmtTime': 'shell', 'Shell': 'shell',
    # data.jsx exports
    'WORKSPACE': 'data', 'PILLARS': 'data', 'INDEX': 'data',
    'TODAY': 'data', 'MOD_CARDS': 'data', 'CONDUCTOR': 'data',
    # fabric.jsx exports
    'ObjRef': 'fabric', 'ObjPreview': 'fabric', 'DossierDrawer': 'fabric', 'OBJ': 'fabric',
    # flipbook.jsx exports
    'Flipbook': 'flipbook',
    # home.jsx exports
    'Home2': 'home',
    # conductor.jsx exports
    'Conductor': 'conductor',
    # ground
    'GROUND_VOCAB': 'ground-data', 'UNIVERSE_DEFAULT': 'ground-data', 'PDS': 'ground-data',
    'RIVER': 'ground-data', 'LANDMARKS': 'ground-data', 'VOTERS': 'ground-data',
    'CANVASSERS': 'ground-data', 'SHIFTS': 'ground-data', 'SCRIPTS': 'ground-data',
    'MODES': 'ground-data',
    'Ground': 'ground',
    # beacon
    'Beacon': 'beacon',
    # raise
    'RAISE_PLEDGES': 'raise-data', 'RAISE_KPIS': 'raise-data', 'RAISE_EVENTS': 'raise-data',
    'RAISE_RECURRING': 'raise-data', 'RAISE_ASKS': 'raise-data',
    'GLR_DATA': 'raise-glr-data', 'GLR_PIPELINE': 'raise-glr-data',
    'RaiseGlr': 'raise-glr',
    'RaiseModals': 'raise-modals', 'AddPledgeModal': 'raise-modals',
    'Raise2': 'raise',
    # ledger
    'LEDGER_KPIS': 'ledger-data', 'LEDGER_JOURNAL': 'ledger-data',
    'LEDGER_COA': 'ledger-data', 'LEDGER_RECONCILE': 'ledger-data',
    'LEDGER_BILLS': 'ledger-data', 'LEDGER_REGULATORS': 'ledger-data',
    'LEDGER_FILINGS': 'ledger-data', 'LEDGER_COMPLIANCE': 'ledger-data',
    'LEDGER_ASSETS': 'ledger-data', 'LEDGER_REPORTS': 'ledger-data',
    'LedgerChart': 'ledger-tabs1', 'LedgerReconcile': 'ledger-tabs1', 'LedgerBills': 'ledger-tabs1',
    'LedgerFilings': 'ledger-tabs2', 'LedgerReports': 'ledger-tabs2',
    'LedgerCompliance': 'ledger-tabs3', 'LedgerAssets': 'ledger-tabs3',
    'NewEntryModal': 'ledger-modal',
    'Ledger2': 'ledger',
    # coalition
    'COA_KPIS': 'coalition-data', 'COA_LEDGER': 'coalition-data', 'COA_ORGS': 'coalition-data',
    'COA_ASKS_STAGES': 'coalition-data', 'COA_ASKS': 'coalition-data',
    'COA_OPS': 'coalition-data', 'COA_COMMS': 'coalition-data',
    'COA_EVENTS': 'coalition-data', 'COA_GRAPH': 'coalition-data',
    'CoalitionGraph': 'coalition-graph',
    'CoalitionDirectory': 'coalition-directory',
    'CoalitionTabs': 'coalition-tabs',
    'Coalition2': 'coalition',
    # civic
    'CIVIC_KPIS': 'civic-data', 'CIVIC_ORGS': 'civic-data', 'CIVIC_ASKS': 'civic-data',
    'CIVIC_EVENTS': 'civic-data', 'CIVIC_BILLS': 'civic-data',
    'CivicTabs': 'civic-tabs',
    'Civic2': 'civic',
    # opp
    'OPP_KPIS': 'opp-data', 'OPP_CLAIMS': 'opp-data', 'OPP_OPPS': 'opp-data',
    'OPP_RAPID': 'opp-data', 'OPP_MONITOR': 'opp-data',
    'OppTabs': 'opp-tabs',
    'Opposition2': 'opp',
    # site
    'SITE_KPIS': 'site-data', 'SITE_PAGES': 'site-data', 'SITE_CONTENT': 'site-data',
    'SITE_REDIRECTS': 'site-data', 'SITE_ANALYTICS': 'site-data',
    'SiteTabs': 'site-tabs',
    'Site2': 'site',
    # events
    'EVT_KPIS': 'events-data', 'EVENTS': 'events-data', 'EVT_VENUES': 'events-data',
    'EVT_TYPES': 'events-data',
    'EventsTabs': 'events-tabs',
    'Events2': 'events',
    # command
    'CMD_WORKSPACES': 'command-data', 'CMD_GROUPS': 'command-data',
    'CMD_MESSAGES': 'command-data', 'CMD_THREAD': 'command-data',
    'CMD_MEMBERS_IN_ROOM': 'command-data', 'CMD_SLASH': 'command-data',
    'Command': 'command',
    # academy
    'ACADEMY_MODULES': 'academy-data', 'ACADEMY_PROGRESS': 'academy-data',
    'AcademyTabs': 'academy-tabs', 'AcademyTabs2': 'academy-tabs2',
}

def convert_file(src_path, dst_path, css_file=None):
    with open(src_path) as f:
        content = f.read()

    lines = content.split('\n')
    output_lines = []

    # Find all window.ALLCAPS usages (not assignments at definition level)
    used_globals = set()
    window_defs = []  # lines that define window globals

    # Pattern: window.ALLCAPS = ... (definition/assignment)
    def_pattern = re.compile(r'^(window\.)([A-Z][A-Za-z0-9_]*)(\s*=)')
    # Pattern: window.ALLCAPS used (not at start of line as definition)
    use_pattern = re.compile(r'window\.([A-Z][A-Za-z0-9_]+)')

    # Find all window globals used in the file (excludes self-assignments)
    for line in lines:
        for m in use_pattern.finditer(line):
            name = m.group(1)
            # If this is a definition line (starts with window.X =), skip it
            stripped = line.strip()
            if not def_pattern.match(stripped):
                used_globals.add(name)

    # Also check for component-style definitions like `window.ComponentName = ComponentName;`
    # These are exports
    export_names = []
    export_pattern = re.compile(r'^window\.([A-Za-z][A-Za-z0-9_]*)\s*=\s*[A-Za-z][A-Za-z0-9_]*\s*;?\s*$')

    for line in lines:
        m = export_pattern.match(line.strip())
        if m:
            export_names.append(m.group(1))

    # Build imports needed
    needed_imports = {}  # module -> set of names
    for name in used_globals:
        if name in DATA_SOURCES:
            src_mod = DATA_SOURCES[name]
            if src_mod not in needed_imports:
                needed_imports[src_mod] = set()
            needed_imports[src_mod].add(name)

    # Build the output
    # 1. React import
    react_import = 'import React from \'react\';\n'

    # 2. CSS import
    css_import = f"import './{css_file}';\n" if css_file else ''

    # 3. Module imports
    module_imports = ''
    for mod, names in sorted(needed_imports.items()):
        names_sorted = ', '.join(sorted(names))
        module_imports += f"import {{ {names_sorted} }} from './{mod}';\n"

    # Build header
    header = react_import
    if css_import:
        header += css_import
    if module_imports:
        header += module_imports

    # Process lines: skip any existing file-level React destructuring, convert window defs/uses
    processed_lines = []
    skip_next = False
    for line in lines:
        stripped = line.strip()

        # Skip React destructuring lines at file level
        # e.g. const { useState: lTUS, useMemo: lTUM } = React;
        if re.match(r'^const\s*\{[^}]+\}\s*=\s*React\s*;', stripped):
            processed_lines.append(line)  # keep it, React is now imported
            continue

        # Skip window global definitions (window.X = LARGE_OBJECT)
        # These will be handled by the sed approach for data files
        # For component files, these are the "export" lines at the bottom
        if def_pattern.match(stripped):
            # Keep but transform: window.X = X; → (will be replaced by export at bottom)
            if export_pattern.match(stripped):
                # This is an export assignment like window.Foo = Foo;
                # Skip it (we'll add export at the bottom)
                continue
            else:
                # This is a data definition like window.MY_DATA = { ... }
                # Convert window.X = to export const X =
                new_line = re.sub(r'^window\.([A-Za-z][A-Za-z0-9_]*)\s*=', r'export const \1 =', stripped)
                processed_lines.append(new_line)
                continue

        # Replace window.ALLCAPS usages with just the name
        new_line = re.sub(r'window\.([A-Z][A-Za-z0-9_]+)', r'\1', line)
        processed_lines.append(new_line)

    # Add exports at the bottom if needed
    processed_content = '\n'.join(processed_lines)

    # Add export statement
    if export_names:
        # Check for LEDGER_JOURNAL mutation pattern and fix it
        processed_content = processed_content.replace(
            'LEDGER_JOURNAL = [je, ...LEDGER_JOURNAL]',
            'LEDGER_JOURNAL.unshift(je)'
        )
        # Also fix the if check
        processed_content = processed_content.replace(
            'if (LEDGER_JOURNAL) LEDGER_JOURNAL.unshift(je)',
            'LEDGER_JOURNAL.unshift(je)'
        )
        export_line = f"\nexport {{ {', '.join(export_names)} }};"
        processed_content = processed_content + export_line

    # Remove ReactDOM.createRoot line if present (that goes in main.jsx)
    processed_content = re.sub(
        r'ReactDOM\.createRoot[^;]+;',
        '',
        processed_content
    )

    # Build final output
    final = header + '\n' + processed_content

    # Clean up multiple blank lines
    final = re.sub(r'\n{3,}', '\n\n', final)

    with open(dst_path, 'w') as f:
        f.write(final)

    print(f"Converted: {os.path.basename(dst_path)}")
    if export_names:
        print(f"  exports: {export_names}")
    if needed_imports:
        for mod, names in needed_imports.items():
            print(f"  from ./{mod}: {sorted(names)}")


if __name__ == '__main__':
    SRC = '/home/claude/repo/project/v2'
    DST = '/home/claude/mandate-app/src'

    # Files to convert: (source_name, css_file_or_None)
    files = [
        # ledger components
        ('ledger-tabs1', 'ledger-tabs1.css'),
        ('ledger-tabs2', 'ledger-tabs2.css'),
        ('ledger-tabs3', 'ledger-tabs3.css'),
        ('ledger-modal', 'ledger-modal.css'),
        ('ledger', 'ledger.css'),
        # coalition
        ('coalition-graph', 'coalition-graph.css'),
        ('coalition-directory', 'coalition-directory.css'),
        ('coalition-tabs', 'coalition-tabs.css'),
        ('coalition', 'coalition.css'),
        # civic
        ('civic-tabs', None),
        ('civic', 'civic.css'),
        # opp
        ('opp-tabs', None),
        ('opp', 'opp.css'),
        # site
        ('site-tabs', None),
        ('site', 'site.css'),
        # events
        ('events-tabs', None),
        ('events', 'events.css'),
        # academy
        ('academy-tabs', None),
        ('academy-tabs2', None),
        # ground
        ('ground', 'ground.css'),
        # beacon
        ('beacon-tabs', 'beacon-tabs.css'),
        ('beacon', 'beacon.css'),
        # raise
        ('raise-glr', 'raise-glr.css'),
        ('raise-modals', 'raise-modals.css'),
        ('raise', 'raise.css'),
    ]

    # Also convert coalition-data using different pattern (window.X = pattern)
    for name, css in [('coalition-data', None)]:
        src_p = f'{SRC}/{name}.jsx'
        dst_p = f'{DST}/{name}.jsx'
        import subprocess
        subprocess.run(['sed', 's/^window\\.\\([A-Za-z_0-9]*\\) =/export const \\1 =/g',
                       src_p], stdout=open(dst_p, 'w'))
        print(f"Data-converted: {name}.jsx")

    for name, css in files:
        src_p = f'{SRC}/{name}.jsx'
        dst_p = f'{DST}/{name}.jsx'
        if not os.path.exists(src_p):
            print(f"SKIP (not found): {name}.jsx")
            continue
        convert_file(src_p, dst_p, css)
