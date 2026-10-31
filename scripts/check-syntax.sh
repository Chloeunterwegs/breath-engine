#!/bin/bash
# syntax-check-on-save: 保存 .js 文件后的建议性语法检查（不阻塞 agent）
# STDIN: 会话上下文 JSON（含保存的文件路径，字段名容错探测）
input=$(cat)
file=$(printf '%s' "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if isinstance(d, dict):
    for k in ('filePath', 'file_path', 'path', 'filename', 'file'):
        if k in d and isinstance(d[k], str):
            sys.stdout.write(d[k]); break
" 2>/dev/null)
if [ -n "$file" ] && [[ "$file" == *.js || "$file" == *.mjs ]]; then
  node --check "$file" 2>/dev/null || echo "[hook] 提示：$file 语法检查未过（建议性，不阻塞）"
fi
exit 0
