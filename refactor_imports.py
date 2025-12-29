import os
import re

replacements = [
    # Update main.ts imports
    (r'"\./ipc/([^"]+)"', r'"./handlers/\1.handler"'),
    (r'import \* as (\w+)Ipc', r'import * as \1Handler'),
    (r'(\w+)Ipc\.register', r'\1Handler.register'),
]

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        new_content = content
        for pattern, replacement in replacements:
            new_content = re.sub(pattern, replacement, new_content)

        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {filepath}")
    except Exception as e:
        print(f"Error {filepath}: {e}")

process_file('electron/src/main.ts')
print("Backend import refactor successful.")
