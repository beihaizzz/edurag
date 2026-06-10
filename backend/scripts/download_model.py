"""EduRAG Embedding 模型下载脚本（仅 EMBEDDING_PROVIDER=local 时需要）

⚠️ 推荐使用 SiliconFlow API（无需下载模型）:
    .env 中设置:
      EMBEDDING_PROVIDER=siliconflow
      SILICONFLOW_API_KEY=sk-xxxx  (https://cloud.siliconflow.cn/account/ak)

仅当 EMBEDDING_PROVIDER=local 时需要运行此脚本下载本地模型。
"""

import os
import sys

MODEL_NAME = "BAAI/bge-large-zh-v1.5"


def try_modelscope():
    """方案 1: ModelScope（国内推荐）"""
    try:
        from modelscope import snapshot_download
        print("→ 使用 ModelScope 下载...")
        path = snapshot_download(MODEL_NAME, cache_dir="./models")
        print(f"✓ 下载完成: {path}")
        return True
    except ImportError:
        print("⚠ modelscope 未安装。安装: pip install modelscope")
        return False
    except Exception as e:
        print(f"⚠ ModelScope 下载失败: {e}")
        return False


def try_hf_mirror():
    """方案 2: HF 镜像"""
    try:
        os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
        from huggingface_hub import snapshot_download
        print("→ 使用 HF 镜像下载...")
        path = snapshot_download(MODEL_NAME)
        print(f"✓ 下载完成: {path}")
        return True
    except Exception as e:
        print(f"⚠ HF 下载失败: {e}")
        return False


def verify():
    """验证模型"""
    try:
        from sentence_transformers import SentenceTransformer
        m = SentenceTransformer(MODEL_NAME)
        dim = m.get_sentence_embedding_dimension()
        print(f"✓ 模型可用，维度: {dim}")
        return True
    except Exception:
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("EduRAG Embedding 模型下载工具")
    print("=" * 60)

    if verify():
        print("模型已可用，无需重复下载。")
        sys.exit(0)

    print()
    print("⚠️  推荐改用 SiliconFlow API（无需下载模型）。")
    print("   在 .env 中设置 EMBEDDING_PROVIDER=siliconflow 并填入 API Key。")
    print()

    success = try_modelscope() or try_hf_mirror()

    if not success:
        print()
        print("所有自动下载方案均失败。请手动下载模型文件。")
        print(f"模型页面: https://huggingface.co/{MODEL_NAME}")
        print(f"下载后放入 models/{MODEL_NAME}/，并在 .env 中设置:")
        print(f"  EMBEDDING_MODEL=models/{MODEL_NAME}")
