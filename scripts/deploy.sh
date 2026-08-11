#!/usr/bin/env bash
# BDFZ deploy gate (2026-08-10): 生產部署要求源碼 clean + 已推送。
bash /Users/ylsuen/CF/scripts/git-deploy-gate.sh || exit 1
export BDFZ_DEPLOY_GATE_PASSED=1
