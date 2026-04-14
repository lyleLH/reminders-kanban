#!/usr/bin/env python3
"""Reminders Kanban — Swift Helper 自动化测试

用法：
  cd src-tauri/swift-helper
  swiftc -O -framework EventKit -o reminders-helper reminders-helper.swift
  python3 test_helper.py
"""
import subprocess, json, sys, time

TEST_LIST = "_test_kanban_"
PASS = 0
FAIL = 0

def send(proc, cmd):
    line = json.dumps(cmd) + "\n"
    proc.stdin.write(line.encode())
    proc.stdin.flush()
    resp = proc.stdout.readline().decode().strip()
    return json.loads(resp)

def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        print(f"  ✗ {name}  {detail}")

def find_task(items, task_id):
    return next((t for t in items if t.get("id") == task_id), None)

def cleanup(proc):
    """无条件清理测试列表"""
    try:
        send(proc, {"action": "delete-list", "name": TEST_LIST})
    except Exception:
        pass
    try:
        send(proc, {"action": "delete-list", "name": TEST_LIST + "_renamed"})
    except Exception:
        pass

def main():
    global PASS, FAIL

    proc = subprocess.Popen(
        ["./reminders-helper"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )

    # ── 1. Ready ──
    print("\n═══ Swift Helper 测试 ═══\n")
    ready = json.loads(proc.stdout.readline().decode().strip())
    check("1. 启动就绪", ready.get("ready") == True, f"got: {ready}")

    try:
        run_tests(proc)
    finally:
        # 无条件清理，即使测试中途崩溃
        cleanup(proc)
        try:
            proc.stdin.close()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    total = PASS + FAIL
    print(f"\n═══ 结果: {PASS}/{total} 通过", end="")
    if FAIL > 0:
        print(f", {FAIL} 失败 ═══\n")
        sys.exit(1)
    else:
        print(" ═══\n")
        sys.exit(0)

def run_tests(proc):
    global PASS, FAIL

    # ── 2. lists ──
    r = send(proc, {"action": "lists"})
    check("2. lists 返回数组", isinstance(r, list) and len(r) > 0)

    # ── 3. create-list ──
    # 先清理可能残留的测试列表
    cleanup(proc)

    r = send(proc, {"action": "create-list", "name": TEST_LIST})
    check("3. create-list", r.get("ok") == True, f"got: {r}")

    r = send(proc, {"action": "lists"})
    names = [l["name"] for l in r]
    check("3b. lists 包含测试列表", TEST_LIST in names, f"names: {names}")

    # ── 4. add 任务A ──
    r = send(proc, {"action": "add", "list": TEST_LIST, "title": "测试任务A"})
    check("4. add 任务A", r.get("ok") == True and "id" in r, f"got: {r}")
    id_a = r.get("id", "")

    # ── 5. add 任务B ──
    r = send(proc, {"action": "add", "list": TEST_LIST, "title": "测试任务B"})
    check("5. add 任务B", r.get("ok") == True and "id" in r)
    id_b = r.get("id", "")

    # ── 6. list 查询 ──
    items = send(proc, {"action": "list", "name": TEST_LIST})
    check("6. list 返回2个任务", isinstance(items, list) and len(items) >= 2, f"count: {len(items) if isinstance(items, list) else items}")
    ta = find_task(items, id_a)
    tb = find_task(items, id_b)
    check("6b. 任务A存在且status=待办", ta is not None and ta.get("status") == "待办", f"ta: {ta}")
    check("6c. 任务B存在且未完成", tb is not None and tb.get("completed") == False)

    # ── 7. set-status ──
    r = send(proc, {"action": "set-status", "id": id_a, "status": "进行中"})
    check("7. set-status 进行中", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("7b. 查询status=进行中", ta is not None and ta.get("status") == "进行中", f"status: {ta.get('status') if ta else 'not found'}")

    # ── 8. set-priority high ──
    r = send(proc, {"action": "set-priority", "id": id_a, "value": 1})
    check("8. set-priority=1(high)", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("8b. priorityValue=1, priority=high, flagged=true",
          ta and ta.get("priorityValue") == 1 and ta.get("priority") == "high" and ta.get("flagged") == True,
          f"ta: {ta}")

    # ── 9. set-priority 0（含 flagged 清除验证）──
    r = send(proc, {"action": "set-priority", "id": id_a, "value": 0})
    check("9. set-priority=0(无)", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("9b. 无优先级且flagged消失", ta and ta.get("priorityValue") == 0 and ta.get("priority") is None and ta.get("flagged") is None)

    # ── 10. update title ──
    r = send(proc, {"action": "update", "id": id_a, "field": "title", "value": "改名后A"})
    check("10. update title", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("10b. title已改", ta and ta.get("title") == "改名后A", f"title: {ta.get('title') if ta else 'not found'}")

    # ── 11. update notes（不丢status） ──
    r = send(proc, {"action": "update", "id": id_a, "field": "notes", "value": "描述内容"})
    check("11. update notes", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("11b. notes=描述内容", ta and ta.get("notes") == "描述内容")
    check("11c. status仍=进行中", ta and ta.get("status") == "进行中", f"status: {ta.get('status') if ta else '?'}")

    # ── 12. update emoji ──
    r = send(proc, {"action": "update", "id": id_a, "field": "emoji", "value": "🔥"})
    check("12. update emoji", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("12b. emoji=🔥", ta and ta.get("emoji") == "🔥")
    check("12c. notes不含[emoji:]标签", ta and "[emoji:" not in (ta.get("notes") or ""))

    # ── 12d. 组合验证：notes + emoji + status 同时存在 ──
    check("12d. 三者共存: notes=描述内容", ta and ta.get("notes") == "描述内容")
    check("12e. 三者共存: status=进行中", ta and ta.get("status") == "进行中")
    check("12f. 三者共存: emoji=🔥", ta and ta.get("emoji") == "🔥")

    # ── 13. update url ──
    r = send(proc, {"action": "update", "id": id_a, "field": "url", "value": "https://example.com"})
    check("13. update url", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("13b. url=https://example.com", ta and ta.get("url") == "https://example.com")

    # ── 14. update url 清空 ──
    r = send(proc, {"action": "update", "id": id_a, "field": "url", "value": ""})
    check("14. clear url", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("14b. url已清空", ta and ta.get("url") is None)

    # ── 15. set-status 改状态后 notes 和 emoji 不丢 ──
    r = send(proc, {"action": "set-status", "id": id_a, "status": "已完成"})
    check("15. set-status 已完成", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("15b. status=已完成", ta and ta.get("status") == "已完成")
    check("15c. notes保留=描述内容", ta and ta.get("notes") == "描述内容", f"notes: {ta.get('notes') if ta else '?'}")
    check("15d. emoji保留=🔥", ta and ta.get("emoji") == "🔥", f"emoji: {ta.get('emoji') if ta else '?'}")

    # ── 16. update notes 后 emoji 和 status 不丢 ──
    r = send(proc, {"action": "set-status", "id": id_a, "status": "进行中"})
    r = send(proc, {"action": "update", "id": id_a, "field": "notes", "value": "新描述"})
    check("16. update notes后", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("16b. notes=新描述", ta and ta.get("notes") == "新描述")
    check("16c. emoji仍=🔥", ta and ta.get("emoji") == "🔥", f"emoji: {ta.get('emoji') if ta else '?'}")
    check("16d. status仍=进行中", ta and ta.get("status") == "进行中")

    # ── 17. update emoji 后 notes 和 status 不丢 ──
    r = send(proc, {"action": "update", "id": id_a, "field": "emoji", "value": "⭐"})
    check("17. update emoji→⭐", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    ta = find_task(items, id_a)
    check("17b. emoji=⭐", ta and ta.get("emoji") == "⭐")
    check("17c. notes仍=新描述", ta and ta.get("notes") == "新描述")
    check("17d. status仍=进行中", ta and ta.get("status") == "进行中")

    # ── 18. complete ──
    r = send(proc, {"action": "complete", "id": id_b})
    check("18. complete 任务B", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    tb = find_task(items, id_b)
    check("18b. completed=true, status=已完成", tb and tb.get("completed") == True and tb.get("status") == "已完成",
          f"tb: {tb}")

    # ── 19. delete 任务A ──
    r = send(proc, {"action": "delete", "id": id_a})
    check("19. delete 任务A", r.get("ok") == True)
    items = send(proc, {"action": "list", "name": TEST_LIST})
    check("19b. 任务A已消失", find_task(items, id_a) is None)

    # ── 20. delete 任务B ──
    r = send(proc, {"action": "delete", "id": id_b})
    check("20. delete 任务B", r.get("ok") == True)

    # ── 21. rename-list（含任务完整性验证）──
    # 先加一个任务用于验证 rename 后任务还在
    r = send(proc, {"action": "add", "list": TEST_LIST, "title": "rename_test"})
    rename_id = r.get("id", "")

    r = send(proc, {"action": "rename-list", "oldName": TEST_LIST, "newName": TEST_LIST + "_renamed"})
    check("21. rename-list", r.get("ok") == True)
    r = send(proc, {"action": "lists"})
    names = [l["name"] for l in r]
    check("21b. 新名字存在", TEST_LIST + "_renamed" in names)
    # 验证任务还在
    items = send(proc, {"action": "list", "name": TEST_LIST + "_renamed"})
    check("21c. rename后任务仍存在", find_task(items, rename_id) is not None, f"items: {len(items) if isinstance(items, list) else items}")

    # ── 22. delete-list ──
    r = send(proc, {"action": "delete-list", "name": TEST_LIST + "_renamed"})
    check("22. delete-list", r.get("ok") == True)
    r = send(proc, {"action": "lists"})
    names = [l["name"] for l in r]
    check("22b. 已删除", TEST_LIST + "_renamed" not in names)

    # ── 23. 错误处理 ──
    print()
    r = send(proc, {"action": "delete", "id": "FAKE_ID_12345"})
    check("23a. delete 不存在的id", r.get("error") == "not found", f"got: {r}")

    r = send(proc, {"action": "set-status", "id": "FAKE_ID_12345", "status": "x"})
    check("23b. set-status 不存在的id", r.get("error") == "not found")

    r = send(proc, {"action": "add", "list": "NONEXISTENT_LIST_XYZ", "title": "x"})
    check("23c. add 到不存在的list", r.get("error") == "invalid params", f"got: {r}")

    r = send(proc, {"action": "update", "id": "FAKE_ID_12345", "field": "badfield", "value": "x"})
    check("23d. update 不存在的id", r.get("error") == "not found", f"got: {r}")

if __name__ == "__main__":
    main()
