"""
EduRAG 数据库一键初始化脚本

自动完成:
  1. 创建 eduraq 数据库用户（如果不存在）
  2. 创建 eduraq 数据库（如果不存在）
  3. 运行 Alembic 迁移建表
  4. 插入 admin 和默认教师账号

用法:
  1. 修改下方的 POSTGRES_SUPERUSER_PASSWORD 为你的 postgres 用户密码
  2. uv run python scripts/setup_db.py

依赖: pip install psycopg2-binary (同步连接，用于 DDL 操作)
"""
import sys
import subprocess

# ⚠️ 请修改为你的 postgres 超级用户密码
POSTGRES_SUPERUSER_PASSWORD = "postgres"
POSTGRES_HOST = "localhost"
POSTGRES_PORT = 5432

DB_NAME = "eduraq"
DB_USER = "eduraq"
DB_PASS = "eduraq"


def run_sql(sql: str, dbname: str = "postgres"):
    """通过 psql 执行 SQL"""
    import os
    os.environ["PGPASSWORD"] = POSTGRES_SUPERUSER_PASSWORD
    result = subprocess.run(
        [
            "psql",
            "-U", "postgres",
            "-h", POSTGRES_HOST,
            "-p", str(POSTGRES_PORT),
            "-d", dbname,
            "-c", sql,
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"  [WARN] {result.stderr.strip()}")
        return False
    return True


def create_user_and_db():
    """创建 eduraq 用户和数据库"""
    print("1. 创建数据库用户 eduraq...")
    run_sql(f"DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname='{DB_USER}') "
            f"THEN CREATE ROLE {DB_USER} LOGIN PASSWORD '{DB_PASS}'; END IF; END $$;")

    print("2. 创建数据库 eduraq...")
    run_sql(f"SELECT 'database eduraq already exists' FROM pg_database WHERE datname='{DB_NAME}'")
    # CREATE DATABASE 不能在事务块内执行
    import os
    os.environ["PGPASSWORD"] = POSTGRES_SUPERUSER_PASSWORD
    result = subprocess.run(
        [
            "psql",
            "-U", "postgres",
            "-h", POSTGRES_HOST,
            "-p", str(POSTGRES_PORT),
            "-d", "postgres",
            "-c", f"CREATE DATABASE {DB_NAME} OWNER {DB_USER};",
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0 and "already exists" not in result.stderr:
        # 数据库已存在不算错误
        pass

    print("3. 授予 eduraq 权限...")
    run_sql(f"GRANT ALL PRIVILEGES ON DATABASE {DB_NAME} TO {DB_USER};")


def run_alembic():
    """运行 Alembic 迁移"""
    print("4. 运行数据库迁移...")
    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        capture_output=True, text=True,
        cwd=".",
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"  [ERROR] {result.stderr}")
        return False
    return True


def run_init_script():
    """运行初始化脚本"""
    print("5. 创建默认账号...")
    result = subprocess.run(
        ["uv", "run", "python", "scripts/init_db.py"],
        capture_output=True, text=True,
        cwd=".",
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"  [WARN] {result.stderr.strip()}")


if __name__ == "__main__":
    print("=" * 60)
    print("EduRAG 数据库初始化")
    print("=" * 60)
    print(f"目标: {POSTGRES_HOST}:{POSTGRES_PORT}")
    print(f"数据库: {DB_NAME}")
    print(f"用户: {DB_USER}")
    print()

    create_user_and_db()
    run_alembic()
    run_init_script()

    print()
    print("=" * 60)
    print("初始化完成!")
    print(f"  管理员账号: admin001 / Admin@123")
    print(f"  教师账号:   T001~T003 / Teacher@123")
    print("=" * 60)
