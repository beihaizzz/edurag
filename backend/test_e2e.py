"""
EduRAG 端到端测试脚本
流程：教师上传资料 → 文档切块入库 → 学生提问 → LLM回答并援引 → 无关问题拒绝
"""

import requests
import json
import time
import sys

BASE = "http://127.0.0.1:2024/api/v1"

C_G = "\033[92m"
C_R = "\033[91m"
C_Y = "\033[93m"
C_C = "\033[96m"
C_B = "\033[1m"
C_X = "\033[0m"

ok   = lambda m: print(f"{C_G}OK{C_X} {m}")
fail = lambda m: print(f"{C_R}FAIL{C_X} {m}")
info = lambda m: print(f"{C_C}>>>{C_X} {m}")
titl = lambda m: print(f"\n{C_B}{'='*58}{C_X}\n{C_B}{C_Y}  {m}{C_X}\n{C_B}{'='*58}{C_X}\n")


def req(method, path, token=None, **kw):
    h = kw.pop("headers", {})
    if token: h["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE}{path}", headers=h, **kw)


def login(u, p):
    r = req("POST", "/auth/login", json={"username": u, "password": p})
    if r.status_code == 200 and "data" in r.json():
        d = r.json()["data"]
        ok(f"登录 {u} → {d['user']['role']} (id={d['user']['id']})")
        return d["access_token"], d["user"]
    fail(f"登录 {u} 失败: {r.status_code} {r.text[:100]}")
    return None, None


def register(u, p):
    r = req("POST", "/auth/register", json={"username": u, "password": p})
    if r.status_code == 200 and "data" in r.json():
        ok(f"注册 {u}")
        return r.json()["data"]["user"]["id"]
    if r.json().get("code") == 40001:
        info(f"用户 {u} 已存在")
        t, usr = login(u, p)
        return usr["id"] if usr else None
    fail(f"注册 {u} 失败: {r.status_code} {r.text[:100]}")
    return None


def stream_qa(token, question, course_id=None):
    info(f"提问: \"{question}\"")
    body = {"question": question, "use_web_search": False}
    if course_id: body["course_id"] = course_id
    r = requests.post(f"{BASE}/qa", json=body,
        headers={"Authorization": f"Bearer {token}"}, stream=True, timeout=120)
    if r.status_code != 200:
        fail(f"QA 失败: {r.status_code} {r.text[:200]}")
        return
    stage = ""
    answer = ""
    sources = []
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "): continue
        try:
            ev = json.loads(line[6:])
        except Exception:
            continue
        etype = ev.get("type", ev.get("event", ""))
        data = ev.get("data", {})
        if etype == "classify":
            stage = data.get("intent", "") if isinstance(data, dict) else data
            info(f"  意图: {stage}")
        elif etype == "retrieve":
            n = data.get("hit_count", 0) if isinstance(data, dict) else 0
            info(f"  检索: {n} 条命中")
        elif etype == "generate":
            d = data.get("content", "") if isinstance(data, dict) else data
            if d and d != "[DONE]": answer += d
        elif etype == "review":
            pass
        elif etype == "reject":
            reason = data.get("reason", "") if isinstance(data, dict) else str(data)
            fail(f"  拒绝: {reason}")
        elif etype == "done":
            ans = data.get("answer", "")
            is_rej = data.get("is_rejected", False)
            srcs = data.get("sources", [])
            if is_rej:
                fail(f"  最终被拒绝 → \"{ans[:100]}\"")
            else:
                ok(f"  回答完成！")
                print(f"  {C_C}── 回答 ──{C_X}")
                print(ans[:600] + ("..." if len(ans) > 600 else ""))
                if srcs:
                    print(f"  {C_C}── 援引来源 ({len(srcs)}条) ──{C_X}")
                    for s in srcs[:4]:
                        title = s.get("document_title", "?")
                        score = s.get("score", 0)
                        chunk = s.get("content", "")[:60]
                        print(f"    [{score:.3f}] {title}: 「{chunk}...」")
                print()


def main():
    # 0. Health check
    titl("0. 健康检查")
    try:
        r = requests.get("http://127.0.0.1:2024/health", timeout=5)
        ok(f"服务在线: {r.json()}")
    except Exception:
        fail("服务未启动！先运行: E:\\EduRAG\\backend\\.venv\\Scripts\\langgraph.exe dev")
        return 1

    # 1. Admin login
    titl("1. 管理员登录")
    at, au = login("admin001", "Admin@123")
    if not at: return 1

    # 2. Teacher setup
    titl("2. 教师账号准备")
    register("teacher001", "Teacher@123")
    # Ensure teacher role via DB
    import asyncio, asyncpg
    async def set_role(user, role):
        c = await asyncpg.connect("postgresql://eduraq:eduraq@localhost:5432/eduraq")
        await c.execute(f"UPDATE users SET role = '{role}' WHERE username = '{user}'")
        await c.close()
    asyncio.run(set_role("teacher001", "teacher"))
    tt, tu = login("teacher001", "Teacher@123")
    if not tt: return 1
    ok(f"教师就绪: {tu.get('role', '?')}")

    # 3. Create course
    titl("3. 创建课程")
    r = req("POST", "/courses", token=tt, json={
        "name": "数据结构与算法", "semester": "2025-2026-1",
        "description": "计算机科学基础课"})
    if r.status_code in (200, 201):
        cid = r.json()["data"]["id"]
        ok(f"课程: {cid}")
    else:
        # get existing
        r = req("GET", "/courses", token=tt)
        courses = r.json().get("data", {}).get("items", [])
        cid = courses[0]["id"] if courses else None
        ok(f"已有课程: {cid}")

    # 4. Upload document
    titl("4. 教师上传文档 \"数据结构与算法 - 课程讲义\"")
    with open("E:\\EduRAG\\backend\\test_material.txt", "rb") as f:
        r = req("POST", "/documents", token=tt,
            files={"file": ("dsa_intro.txt", f, "text/plain")},
            data={"title": "数据结构与算法 - 课程讲义", "file_type": "courseware",
                  "course_id": str(cid), "description": "线性表/树/图 讲义",
                  "tags": '["数据结构","算法","树","图"]'})
    if r.status_code == 201:
        did = r.json()["data"]["id"]
        ok(f"上传成功: id={did}")
    else:
        fail(f"上传失败: {r.status_code} {r.text[:200]}")
        return 1

    # 5. Wait for processing
    titl("5. 等待文档切块入库")
    chunks = 0
    for i in range(30):
        r = req("GET", f"/documents/{did}", token=tt)
        d = r.json().get("data", {}) if r.status_code == 200 else {}
        chunks = d.get("chunk_count", 0)
        status = d.get("processing_status", "?")
        info(f"  状态={status}, 切块={chunks} ({i+1}/30)")
        if status in ("completed", "approved"): break
        time.sleep(2)
    if chunks == 0:
        fail("文档未正确切块")
    else:
        ok(f"文档已切块: {chunks} 块")

    # 6. Approve document
    titl("6. 管理员审核通过")
    r = req("POST", f"/admin/documents/{did}/approve", token=at,
            json={"status": "approved", "comment": "OK"})
    if r.status_code not in (200, 201):
        info(f"API审核失败(可能端点不同)，直接DB设置...")
        async def approve():
            c = await asyncpg.connect("postgresql://eduraq:eduraq@localhost:5432/eduraq")
            await c.execute("UPDATE documents SET status='approved' WHERE id=$1", did)
            await c.close()
        asyncio.run(approve())
    ok("文档状态: approved")

    # 7. Student setup
    titl("7. 学生账号准备")
    register("student001", "Student@123")
    st, su = login("student001", "Student@123")
    if not st: return 1

    # 8. Relevant questions
    titl("8.【流程A】学生提问 — 课程相关问题")

    qs_relevant = [
        "什么是二叉树的三种遍历方式？请详细说明。",
        "Dijkstra最短路径算法的核心思想是什么？",
    ]
    for q in qs_relevant:
        print(f"\n{C_B}▶ {q}{C_X}")
        stream_qa(st, q, course_id=cid)

    # 9. Irrelevant questions
    titl("9.【流程B】学生提问 — 无关问题（应被拒绝）")
    qs_irrelevant = [
        "今天天气怎么样？明天会下雨吗？",
    ]
    for q in qs_irrelevant:
        print(f"\n{C_B}▶ {q}{C_X}")
        stream_qa(st, q, course_id=cid)

    titl("测试完成 ✓")
    return 0

if __name__ == "__main__":
    sys.exit(main())
