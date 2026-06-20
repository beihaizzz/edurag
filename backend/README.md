# EduRAG Backend

校园课程资料智能检索与问答服务系统

## 环境安装

依赖统一在 `pyproject.toml` 中声明。**注意 torch 必须使用 CPU 版**——
docling（文档解析）依赖 torch/torchvision，若安装到残缺或不匹配的 torch，
会导致 docling 导入失败、文档审核接口返回 500。

### 方式一：uv（推荐）

`pyproject.toml` 已通过 `[tool.uv.sources]` 将 torch / torchvision 绑定到
PyTorch 官方 CPU 源，直接安装即可：

```bash
cd backend
uv sync
```

### 方式二：pip

pip 不识别 `[tool.uv.sources]`，需手动指定 PyTorch CPU 源安装 torch 系依赖，
再安装其余依赖：

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate        # Windows
# source .venv/bin/activate     # Linux/macOS

pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -e .
```

### 验证 torch 安装完整

```bash
python -c "import torch; print(torch.__version__); import torch.backends.mps"
python -c "from docling.document_converter import DocumentConverter; print('docling OK')"
```

两条命令都无报错即安装正确。若 `import torch` 后 `torch.__version__` 缺失或
报 `module 'torch' has no attribute 'backends'`，说明 torch 安装残缺，需重装：

```bash
pip install --force-reinstall torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

## 启动

```bash
# 数据库（Docker）
..\start-db.ps1

# 后端服务（端口 8000）
..\start-backend.ps1
```

- API: http://localhost:8000
- API 文档: http://localhost:8000/docs
- 默认管理员: admin001 / Admin@123
