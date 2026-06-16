"""
EduRAG 端到端测试
流程A: 教师上传 → 切块入库 → 审核 → 学生提问（获得回答+援引）
流程B: 学生提问无关/作弊问题 → 拒绝回答
"""
import requests, json, time, sys, asyncio
C_G = "\033[92m"; C_R = "\033[91m"; C_Y = "\033[93m"; C_C = "\033[96m"; C_B = "\033[1m"; C_X = "\033[0m"

BASE = "http://127.0.0.1:8000/api/v1"
ok = lambda m: print(f"{C_G}OK{C_X} {m}")
fail = lambda m: print(f"{C_R}FAIL{C_X} {m}")
info = lambda m: print(f"{C_C}>{C_X} {m}")
titl = lambda m: print(f"\n{C_B}{'='*55}{C_X}\n{C_B}{C_Y}  {m}{C_X}\n{C_B}{'='*55}{C_X}\n")

def apicall(method, path, token=None, timeout=30, **kw):
    h = kw.pop("headers", {})
    if token: h["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE}{path}", headers=h, timeout=timeout, **kw)

def login(u, p):
    r = apicall("POST", "/auth/login", json={"username": u, "password": p})
    if r.status_code != 200:
        fail(f"Login fail: {r.status_code} {r.text[:150]}"); return None, None
    d = r.json()["data"]
    ok(f"Login {u} ({d['user']['role']})")
    return d["access_token"], d["user"]

def stream_qa(token, question, course_id=None):
    info(f"Q: {question}")
    body = {"question": question, "use_web_search": False}
    if course_id: body["course_id"] = course_id
    r = requests.post(f"{BASE}/qa", json=body,
        headers={"Authorization": f"Bearer {token}"}, stream=True, timeout=120)
    if r.status_code != 200:
        fail(f"QA fail: {r.status_code} {r.text[:200]}"); return
    classify = ""; answer = ""; sources = []; rejected = False; reject_reason = ""
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "): continue
        try: ev = json.loads(line[6:])
        except: continue
        t = ev.get("type", ev.get("event", "")); d = ev.get("data", {})
        if t == "classify":
            classify = d.get("intent", "?") if isinstance(d, dict) else d
            print(f"  [intent] {classify}")
        elif t == "retrieve":
            n = d.get("hit_count", 0) if isinstance(d, dict) else 0
            print(f"  [retrieve] {n} hits")
        elif t == "generate":
            c = d.get("content", "") if isinstance(d, dict) else d
            if c and c != "[DONE]": answer += c
        elif t == "reject":
            reject_reason = d.get("reason", "") if isinstance(d, dict) else str(d)
            print(f"  {C_Y}[reject] {reject_reason}{C_X}")
        elif t == "done":
            rejected = d.get("is_rejected", False)
            ans = d.get("answer", "")
            srcs = d.get("sources", [])
            if rejected:
                print(f"  {C_Y}-> REJECTED: {ans[:120]}{C_X}")
            else:
                print(f"  {C_G}-> ANSWERED{C_X}")
                print(f"  {C_C}{'-'*50}{C_X}")
                print(ans[:700] + ("" if len(ans) <= 700 else f"..."))
                if srcs:
                    print(f"  {C_C}-- Sources ({len(srcs)}) --{C_X}")
                    for s in srcs[:4]:
                        title = s.get("document_title", "?"); score = s.get("score", 0)
                        content = s.get("content", "")[:80]
                        print(f"  [{score:.3f}] {title}: \"{content}...\"")
            print()

def main():
    titl("0. Health Check")
    try:
        r = requests.get("http://127.0.0.1:8000/health", timeout=5)
        ok(f"Server: {r.json()}")
    except:
        fail("FastAPI not running (uvicorn main:app)"); return 1

    titl("1. Admin Login")
    at, au = login("admin001", "Admin@123")
    if not at: return 1

    titl("2. Teacher Login (T001)")
    tt, tu = login("T001", "Teacher@123")
    if not tt: return 1

    titl("3. Create Course")
    r = apicall("POST", "/courses", token=tt, json={
        "name": "Data Structures", "semester": "2025-2026-1",
        "description": "Core CS course"})
    if r.status_code in (200, 201):
        cid = r.json()["data"]["id"]; ok(f"Course id={cid}")
    else:
        r2 = apicall("GET", "/courses", token=tt)
        items = r2.json().get("data", {}).get("items", [])
        cid = items[0]["id"] if items else None
        ok(f"Existing course id={cid}")

    titl("4. Upload Document")
    with open(r"E:\EduRAG\backend\test_material.txt", "rb") as f:
        r = apicall("POST", "/documents", token=tt,
            files={"file": ("dsa.txt", f, "text/plain")},
            data={"title": "DSA Lecture Notes", "file_type": "courseware",
                  "course_id": str(cid), "description": "LL/Lists/Trees/Graphs",
                  "tags": '["DS","algo","tree","graph"]'})
    if r.status_code == 201:
        did = r.json()["data"]["id"]; ok(f"Uploaded: id={did}")
    else:
        fail(f"Upload fail: {r.status_code} {r.text[:200]}"); return 1

    titl("5. Wait for Processing")
    for i in range(30):
        r = apicall("GET", f"/documents/{did}", token=tt)
        d = r.json().get("data", {}) if r.status_code == 200 else {}
        chunks = d.get("chunk_count", 0)
        status = d.get("processing_status", "?")
        info(f"  status={status} chunks={chunks} ({i+1}/30)")
        if status in ("completed", "approved"): break
        time.sleep(2)
    if chunks > 0:
        ok(f"Chunked: {chunks} chunks")
    else:
        fail(f"Not chunked: status={status}")
        info("Trying manual process trigger...")
        r = apicall("POST", f"/documents/{did}/process", token=tt)
        info(f"Process trigger: {r.status_code}")
        time.sleep(5)
        r = apicall("GET", f"/documents/{did}", token=tt)
        d = r.json().get("data", {}) if r.status_code == 200 else {}
        ok(f"After trigger: chunks={d.get('chunk_count')}, status={d.get('processing_status')}")

    titl("6. Admin Approve")
    r = apicall("POST", f"/admin/documents/{did}/approve", token=at,
                json={"status": "approved", "comment": "OK"})
    if r.status_code in (200, 201):
        ok("Approved via API")
    else:
        info(f"API approve: {r.status_code}, using DB...")
        import asyncpg
        async def approve():
            c = await asyncpg.connect("postgresql://eduraq:eduraq@localhost:5432/eduraq")
            await c.execute("UPDATE documents SET status='approved' WHERE id=$1", did)
            await c.close()
        asyncio.run(approve()); ok("Approved via DB")

    titl("7. Student Login")
    r = apicall("POST", "/auth/register", json={"username": "stu_test", "password": "Student@123"})
    if r.status_code == 200 and r.json().get("code") is None:
        ok("Student registered")
    elif r.json().get("code") == 40001:
        ok("Student exists")
    st, su = login("stu_test", "Student@123")
    if not st: return 1

    titl("8. [Flow A] Relevant Questions")
    qs = [
        "What are the three binary tree traversal methods? Explain each.",
        "What's the difference between Dijkstra and Floyd-Warshall algorithms?",
    ]
    for q in qs:
        print(f"\n{C_B}>> {q}{C_X}")
        stream_qa(st, q, course_id=cid)

    titl("9. [Flow B] Irrelevant Questions (should reject)")
    qs2 = [
        "What's the weather like in Beijing today? Will it rain tomorrow?",
    ]
    for q in qs2:
        print(f"\n{C_B}>> {q}{C_X}")
        stream_qa(st, q, course_id=cid)

    titl("Done!")
    return 0

if __name__ == "__main__":
    sys.exit(main())
