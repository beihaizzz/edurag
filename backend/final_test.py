"""EduRAG e2e test"""
import requests,json,asyncio
B="http://127.0.0.1:8000/api/v1"
def rq(m,p,t=None,**k):
    h=k.pop("headers",{})
    if t:h["Authorization"]=f"Bearer {t}"
    return requests.request(m,f"{B}{p}",headers=h,**k)
def login(u,p):
    r=rq("POST","/auth/login",json={"username":u,"password":p})
    d=r.json()["data"];return d["access_token"],d["user"]
def qa(token,q,cid=None):
    print(f"\n{'='*50}\nQ: {q}\n{'='*50}")
    body={"question":q,"use_web_search":False}
    if cid:body["course_id"]=cid
    r=requests.post(f"{B}/qa",json=body,headers={"Authorization":f"Bearer {token}"},stream=True,timeout=120)
    if r.status_code!=200:print(f"FAIL {r.status_code}");return
    for raw in r.iter_lines(decode_unicode=True):
        if not raw or not raw.startswith("data:"):continue
        try:d=json.loads(raw[5:]);data=d.get("data",d)
        except:continue
        if "intent" in data:print(f"[INTENT] {data['intent']}")
        elif "has_results" in data:print(f"[SEARCH] {data.get('has_results')} ({data.get('count',0)})")
        elif "is_rejected" in data:print(f"[REJECT] {data.get('reason','')[:120]}")
        elif "answer" in data:
            ans=data.get("answer","");rej=data.get("is_rejected",False);srcs=data.get("sources",[])
            print(f"[DONE] rejected={rej} sources={len(srcs)}")
            if not rej:
                for s in srcs[:4]:print(f"  src[{s.get('score',0):.3f}] {s.get('document_title','?')}: {s.get('content','')[:50]}")
                print(f"---\n{ans[:500]}")
            print();return

print("Health:",requests.get("http://127.0.0.1:8000/health").json()["status"])
tt,tu=login("T001","Teacher@123")
st,su=login("stu_e2e","Test@123")
r=rq("GET","/courses",t=tt)
items=r.json().get("data",{}).get("items",[])
cid=items[-1]["id"]if items else 0;print(f"Course: {cid}")
r=rq("GET","/documents",t=tt)
docs=r.json().get("data",{}).get("items",[])
for d in [x for x in docs if x.get("processing_status")=="pending"]:
    print(f"Process doc {d['id']}...")
    r=rq("POST",f"/documents/{d['id']}/process",t=tt)
    print(f"  {r.json().get('message','?')}")
    async def a():
        import asyncpg;c=await asyncpg.connect("postgresql://eduraq:eduraq@localhost:5432/eduraq")
        await c.execute("UPDATE documents SET status='approved' WHERE id=$1",d['id']);await c.close()
    asyncio.run(a());print("  ok")

print("\n=== FLOW A ===")
qa(st,"二叉树的三种遍历方式分别是什么",cid)
qa(st,"Dijkstra最短路径算法的核心原理",cid)
print("\n=== FLOW B ===")
qa(st,"今天天气怎么样明天会下雨吗",cid)
print("\nDONE")
