#!/bin/bash

# 安装依赖项，使用--no-frozen-lockfile选项
pnpm install --no-frozen-lockfile

# 构建应用
pnpm run deploy
