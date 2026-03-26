#!/bin/bash
cd /home/kavia/workspace/code-generation/quality-defect-management-system-3326-3335/frontend_app
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

