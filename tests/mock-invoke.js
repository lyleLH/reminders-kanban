/**
 * Mock @tauri-apps/api/core 的 invoke 函数
 * 在 Playwright addInitScript 中注入，模拟 Swift helper 的全部行为
 */
(() => {
  let nextId = 1;
  const lists = [
    { name: 'Test Board', color: '#4a9eff' },
    { name: 'Work', color: '#ff9500' },
  ];
  const reminders = [
    { id: 'r1', title: '设计首页', notes: '', status: '待办', completed: false, list: 'Test Board', priorityValue: 0 },
    { id: 'r2', title: '编写测试', notes: '- [ ] 单元测试\n- [x] 集成测试', status: '待办', completed: false, list: 'Test Board', priorityValue: 0 },
    { id: 'r3', title: '修复 bug', notes: '', status: '进行中', completed: false, list: 'Test Board', emoji: '🔥', priorityValue: 1, priority: 'high', flagged: true },
    { id: 'r4', title: '已部署', notes: '', status: '已完成', completed: true, list: 'Test Board', priorityValue: 0 },
    { id: 'r5', title: 'Code review', notes: '', status: '待办', completed: false, list: 'Work', priorityValue: 5, priority: 'medium' },
  ];

  function findReminder(id) {
    return reminders.find(r => r.id === id);
  }

  async function mockInvoke(cmd, args = {}) {
    // Simulate a small delay like the real helper
    await new Promise(r => setTimeout(r, 5));

    switch (cmd) {
      case 'get_lists':
        return lists.map(l => ({ ...l }));

      case 'get_reminders': {
        const name = args.list;
        return reminders.filter(r => r.list === name).map(r => ({ ...r }));
      }

      case 'add_reminder': {
        const id = 'r' + (++nextId);
        reminders.push({
          id, title: args.title, notes: '', status: '待办',
          completed: false, list: args.list, priorityValue: 0,
        });
        return { ok: true, id };
      }

      case 'set_status': {
        const r = findReminder(args.id);
        if (!r) throw 'not found';
        r.status = args.status;
        return { ok: true };
      }

      case 'complete_reminder': {
        const r = findReminder(args.id);
        if (!r) throw 'not found';
        r.completed = true;
        r.status = '已完成';
        return { ok: true };
      }

      case 'set_priority': {
        const r = findReminder(args.id);
        if (!r) throw 'not found';
        r.priorityValue = args.value;
        if (args.value === 1) { r.priority = 'high'; r.flagged = true; }
        else if (args.value === 5) { r.priority = 'medium'; delete r.flagged; }
        else if (args.value === 9) { r.priority = 'low'; delete r.flagged; }
        else { delete r.priority; delete r.flagged; }
        return { ok: true };
      }

      case 'update_field': {
        const r = findReminder(args.id);
        if (!r) throw 'not found';
        switch (args.field) {
          case 'title': r.title = args.value; break;
          case 'notes': r.notes = args.value; break;
          case 'url': r.url = args.value || undefined; break;
          case 'emoji': r.emoji = args.value || undefined; break;
        }
        return { ok: true };
      }

      case 'delete_reminder': {
        const idx = reminders.findIndex(r => r.id === args.id);
        if (idx === -1) throw 'not found';
        reminders.splice(idx, 1);
        return { ok: true };
      }

      case 'create_list':
        lists.push({ name: args.name });
        return { ok: true };

      case 'delete_list': {
        const idx = lists.findIndex(l => l.name === args.name);
        if (idx === -1) throw 'not found';
        lists.splice(idx, 1);
        // Remove all reminders in that list
        for (let i = reminders.length - 1; i >= 0; i--) {
          if (reminders[i].list === args.name) reminders.splice(i, 1);
        }
        return { ok: true };
      }

      case 'rename_list': {
        const l = lists.find(l => l.name === args.oldName);
        if (!l) throw 'not found';
        reminders.forEach(r => { if (r.list === args.oldName) r.list = args.newName; });
        l.name = args.newName;
        return { ok: true };
      }

      default:
        throw `unknown command: ${cmd}`;
    }
  }

  // Override the ESM import — Vite transforms `import { invoke }` to a module,
  // so we intercept at the window level and patch the module system
  window.__TAURI_INVOKE_MOCK__ = mockInvoke;
  window.__TAURI_INTERNALS__ = {
    invoke: mockInvoke,
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    convertFileSrc: (path) => path,
  };
})();
