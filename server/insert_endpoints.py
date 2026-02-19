#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script to insert Forms endpoints into server.js
"""

def insert_endpoints():
    # Read endpoints file
    with open('forms_endpoints.js', 'r', encoding='utf-8') as f:
        endpoints_content = f.read()
    
    # Read server.js
    with open('server.js', 'r', encoding='utf-8') as f:
        server_content = f.read()
    
    # Find insertion point (before app.listen)
    insert_marker = 'app.listen(port'
    insert_pos = server_content.find(insert_marker)
    
    if insert_pos == -1:
        print('❌ Could not find insertion point')
        return False
    
    # Create new content
    new_content = (
        server_content[:insert_pos] +
        endpoints_content +
        '\n\n' +
        server_content[insert_pos:]
    )
    
    # Write back to server.js
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print('✅ Forms endpoints successfully added to server.js')
    print(f'   Inserted {len(endpoints_content)} characters')
    return True

if __name__ == '__main__':
    insert_endpoints()
