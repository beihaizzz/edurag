# -*- coding: utf-8 -*-
"""EduRAG 端到端测试 — 教师上传→切块入库→学生提问"""
import requests, json, time, sys, asyncio
C_G="\033[92m";C_R="\033[91m";C_Y="\033[93m";C_C="\033[96m";C_B="\033[1m";C_X="\033[0m"
BASE="http://127.0.0.1:8000/api/v1"
ok=lambda m:print(f"{C_G}OK{C_X} {m}")
fail=lambda m:print(f"{C_R}FAIL{C_X} {m}")
info=lambda m:print(f"{C_C}>{C_X} {m}")
titl=lambda m:print(f"\n{C_B}{'='*55}{C_X}\n{C_B}{C_Y}  {m}{C_X}\n{C_B}{'='*55}{C_X}\n")

def api(method, path, token=None, **kw):
    h=kw.pop("headers",{})
    if token:h["Authorization"]=f"Bearer {token}"
    return requests.request(method,f"{BASE}{path}",headers=h,**kw)

def login(u,p):
    r=api("POST","/auth/login",json={"username":u,"password":p})
    if r.status_code!=200:fail(f"Login fail {u}: {r.status_code}");return None,None
    d=r.json()["data"];ok(f"Login {u} ({d['user']['role']})");return d["access_token"],d["user"]

def stream_qa(token,question,course_id=None):
    info(f"Q: {question}")
    body={"question":question,"use_web_search":False}
    if course_id:body["course_id"]=course_id
    r=requests.post(f"{BASE}/qa",json=body,headers={"Authorization":f"Bearer {token}"},stream=True,timeout=120)
    if r.status_code!=200:fail(f"QA fail: {r.status_code}");return
    answer="";sources=[];rejected=False;intent="";retrieved=0
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):continue
        try:ev=json.loads(line[6:])
        except:continue
        t=ev.get("type",ev.get("event",""));d=ev.get("data",{})
        if t=="classify":intent=d.get("intent","?")if isinstance(d,dict)else d
        elif t=="retrieve":retrieved=d.get("hit_count",0)if isinstance(d,dict)else 0
        elif t=="generate":
            c=d.get("content","")if isinstance(d,dict)else d
            if c and c!="[DONE]":answer+=c
        elif t=="reject":
            reason=d.get("reason","")if isinstance(d,dict)else str(d);print(f"  {C_Y}[REJECT] {reason}{C_X}")
        elif t=="done":
            rejected=d.get("is_rejected",False);ans=d.get("answer","");srcs=d.get("sources",[])
            print(f"  [意图]{intent} [检索]{retrieved}条")
            if rejected:print(f"  {C_Y}→ 被拒绝: {ans[:120]}{C_X}")
            else:
                print(f"  {C_G}→ 回答完成!{C_X}");
                # 显示前几个来源
                if srcs:
                    for s in srcs[:3]:
                        print(f"    来源: [{s.get('score',0):.3f}] {s.get('document_title','?')} | {s.get('content','')[:60]}...")
                # 显示回答前300字
                print(f"  {ans[:300]}{'...' if len(ans)>300 else ''}")
            print();return

def main():
    titl("0. Health Check")
    try:r=requests.get("http://127.0.0.1:8000/health",timeout=5);ok(f"Server: {r.json()}")
    except:fail("Server not running");return 1

    titl("1. Admin Login")
    at,au=login("admin001","Admin@123")
    if not at:return 1

    titl("2. Teacher Login (T001)")
    tt,tu=login("T001","Teacher@123")
    if not tt:return 1

    titl("3. Create Course")
    r=api("POST","/courses",token=tt,json={"name":"CS101 数据结构","semester":"2026-1","description":"基础课"})
    if r.status_code in(200,201):cid=r.json()["data"]["id"];ok(f"Course id={cid}")
    else:
        r2=api("GET","/courses",token=tt)
        items=r2.json().get("data",{}).get("items",[])
        cid=items[0]["id"]if items else None;ok(f"Existing course id={cid}")

    titl("4. Upload Document")
    with open("E:\\EduRAG\\backend\\test_material.txt","rb")as f:
        r=api("POST","/documents",token=tt,
            files={"file":("dsa.txt",f,"text/plain")},
            data={"title":"DSA 课程讲义","file_type":"courseware","course_id":str(cid),
                  "description":"线性表/树/图","tags":'["DS","algo"]'})
    if r.status_code==201:did=r.json()["data"]["id"];ok(f"Uploaded doc id={did}")
    else:fail(f"Upload fail: {r.status_code} {r.text[:200]}");return 1

    titl("5. Trigger Processing")
    r=api("POST",f"/documents/{did}/process",token=tt)
    ok(f"Process: {r.json().get('message','?')}")

    titl("6. Admin Approve")
    import asyncpg
    async def appr():
        c=await asyncpg.connect("postgresql://eduraq:eduraq@localhost:5432/eduraq")
        await c.execute("UPDATE documents SET status='approved' WHERE id=$1",did);await c.close()
    asyncio.run(appr());ok("Approved (direct DB)")

    titl("7. Student Login")
    r=api("POST","/auth/register",json={"username":"stu_e2e","password":"Test@123"})
    st,su=login("stu_e2e","Test@123")
    if not st:return 1

    titl("8.【流程A】学生提问 — 课程相关问题")
    for q in [
        "二叉树的三种遍历方式是什么？请详细说明。",
        "Dijkstra最短路径算法的原理是什么？",
    ]:
        print(f"\n{C_B}>> {q}{C_X}")
        stream_qa(st,q,course_id=cid)

    titl("9.【流程B】学生提问 — 无关问题")
    for q in [
        "今天天气怎么样？明天会不会下雨？",
    ]:
        print(f"\n{C_B}>> {q}{C_X}")
        stream_qa(st,q,course_id=cid)

    titl("Done!");return 0

if __name__=="__main__":sys.exit(main())
