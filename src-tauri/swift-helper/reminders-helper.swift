import EventKit
import Foundation

// ── 状态存储：notes 前缀 [kanban:xxx] ──────────────
let statusPrefix = "[kanban:"
let statusSuffix = "]"
let defaultStatus = "待办"

func statusFromNotes(_ notes: String?) -> String {
    guard let notes = notes, notes.hasPrefix(statusPrefix),
          let end = notes.firstIndex(of: Character("]"))
    else { return defaultStatus }
    let start = notes.index(notes.startIndex, offsetBy: statusPrefix.count)
    return String(notes[start..<end])
}

func setStatusInNotes(_ notes: String?, status: String) -> String {
    let tag = "\(statusPrefix)\(status)\(statusSuffix)"
    guard let notes = notes else { return tag }
    if notes.hasPrefix(statusPrefix), let end = notes.firstIndex(of: Character("]")) {
        let afterTag = notes[notes.index(after: end)...]
        let rest = afterTag.hasPrefix("\n") ? String(afterTag.dropFirst()) : String(afterTag)
        return rest.isEmpty ? tag : "\(tag)\n\(rest)"
    }
    return "\(tag)\n\(notes)"
}

func notesWithoutStatus(_ notes: String?) -> String {
    guard let notes = notes else { return "" }
    var result = notes
    if result.hasPrefix(statusPrefix), let end = result.firstIndex(of: Character("]")) {
        let afterTag = result[result.index(after: end)...]
        result = afterTag.hasPrefix("\n") ? String(afterTag.dropFirst()) : String(afterTag)
    }
    if let range = result.range(of: #"\[emoji:[^\]]+\]\n?"#, options: .regularExpression) {
        result.removeSubrange(range)
    }
    return result
}

func emojiFromNotes(_ notes: String?) -> String? {
    guard let notes = notes,
          let range = notes.range(of: #"\[emoji:([^\]]+)\]"#, options: .regularExpression)
    else { return nil }
    let tag = String(notes[range])
    let start = tag.index(tag.startIndex, offsetBy: 7)
    let end = tag.index(before: tag.endIndex)
    return String(tag[start..<end])
}

func setEmojiInNotes(_ notes: String?, emoji: String?) -> String {
    var result = notes ?? ""
    if let range = result.range(of: #"\[emoji:[^\]]+\]\n?"#, options: .regularExpression) {
        result.removeSubrange(range)
    }
    guard let emoji = emoji, !emoji.isEmpty else { return result }
    if result.hasPrefix(statusPrefix), let end = result.firstIndex(of: Character("]")) {
        let afterTag = result.index(after: end)
        if afterTag < result.endIndex && result[afterTag] == "\n" {
            result.insert(contentsOf: "[emoji:\(emoji)]\n", at: result.index(after: afterTag))
        } else {
            result.insert(contentsOf: "\n[emoji:\(emoji)]", at: afterTag)
        }
    } else {
        result = "[emoji:\(emoji)]\n\(result)"
    }
    return result
}

func priorityLabel(_ p: Int) -> String? {
    switch p {
    case 1: return "high"
    case 5: return "medium"
    case 9: return "low"
    default: return nil
    }
}

// ── EventKit store ─────────────────────────────────
let store = EKEventStore()

func requestAccess() -> Bool {
    let sem = DispatchSemaphore(value: 0)
    var granted = false
    if #available(macOS 14.0, *) {
        store.requestFullAccessToReminders { g, _ in
            granted = g
            sem.signal()
        }
    } else {
        store.requestAccess(to: .reminder) { g, _ in
            granted = g
            sem.signal()
        }
    }
    sem.wait()
    return granted
}

// ── Reminder helpers ───────────────────────────────
func findReminder(id: String) -> EKReminder? {
    store.calendarItem(withIdentifier: id) as? EKReminder
}

func reminderToDict(_ r: EKReminder, isCompleted: Bool) -> [String: Any] {
    var d: [String: Any] = [
        "id": r.calendarItemIdentifier,
        "title": r.title ?? "",
        "notes": notesWithoutStatus(r.notes),
        "status": isCompleted ? "已完成" : statusFromNotes(r.notes),
        "completed": isCompleted,
        "list": r.calendar.title,
    ]
    if let emoji = emojiFromNotes(r.notes) { d["emoji"] = emoji }
    d["priorityValue"] = r.priority
    if let pl = priorityLabel(Int(r.priority)) { d["priority"] = pl }
    if r.priority == 1 { d["flagged"] = true }
    if let dc = r.dueDateComponents, let date = Calendar.current.date(from: dc) {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        d["dueDate"] = fmt.string(from: date)
    }
    if let url = r.url { d["url"] = url.absoluteString }
    return d
}

// ── Command handlers ───────────────────────────────
func handleCommand(_ cmd: [String: Any]) -> Any {
    let action = cmd["action"] as? String ?? ""

    switch action {
    case "lists":
        let calendars = store.calendars(for: .reminder)
        return calendars.map { cal -> [String: Any] in
            var entry: [String: Any] = ["name": cal.title]
            if let cg = cal.cgColor, let comps = cg.components, cg.numberOfComponents >= 3 {
                let r = Int(comps[0] * 255), g = Int(comps[1] * 255), b = Int(comps[2] * 255)
                entry["color"] = String(format: "#%02x%02x%02x", r, g, b)
            }
            return entry
        }

    case "list":
        guard let listName = cmd["name"] as? String,
              let cal = store.calendars(for: .reminder).first(where: { $0.title == listName })
        else { return [] as [[String: Any]] }

        var results: [[String: Any]] = []

        let sem1 = DispatchSemaphore(value: 0)
        let incompletePred = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: [cal])
        store.fetchReminders(matching: incompletePred) { rems in
            defer { sem1.signal() }
            for r in (rems ?? []) { results.append(reminderToDict(r, isCompleted: false)) }
        }
        sem1.wait()

        let now = Date()
        let ago = Calendar.current.date(byAdding: .day, value: -30, to: now)!
        let completedPred = store.predicateForCompletedReminders(withCompletionDateStarting: ago, ending: now, calendars: [cal])
        let sem2 = DispatchSemaphore(value: 0)
        store.fetchReminders(matching: completedPred) { rems in
            defer { sem2.signal() }
            for r in (rems ?? []) { results.append(reminderToDict(r, isCompleted: true)) }
        }
        sem2.wait()

        return results

    case "add":
        guard let listName = cmd["list"] as? String,
              let title = cmd["title"] as? String,
              let cal = store.calendars(for: .reminder).first(where: { $0.title == listName })
        else { return ["error": "invalid params"] }
        let r = EKReminder(eventStore: store)
        r.title = title
        r.calendar = cal
        r.priority = 0
        do {
            try store.save(r, commit: true)
            return ["ok": true, "id": r.calendarItemIdentifier] as [String: Any]
        } catch { return ["error": error.localizedDescription] }

    case "set-status":
        guard let id = cmd["id"] as? String,
              let status = cmd["status"] as? String,
              let r = findReminder(id: id)
        else { return ["error": "not found"] }
        r.notes = setStatusInNotes(r.notes, status: status)
        do { try store.save(r, commit: true); return ["ok": true] }
        catch { return ["error": error.localizedDescription] }

    case "complete":
        guard let id = cmd["id"] as? String, let r = findReminder(id: id)
        else { return ["error": "not found"] }
        r.isCompleted = true
        do { try store.save(r, commit: true); return ["ok": true] }
        catch { return ["error": error.localizedDescription] }

    case "set-priority":
        guard let id = cmd["id"] as? String,
              let val = cmd["value"] as? Int,
              let r = findReminder(id: id)
        else { return ["error": "not found"] }
        r.priority = val
        do { try store.save(r, commit: true); return ["ok": true] }
        catch { return ["error": error.localizedDescription] }

    case "update":
        guard let id = cmd["id"] as? String,
              let field = cmd["field"] as? String,
              let value = cmd["value"] as? String,
              let r = findReminder(id: id)
        else { return ["error": "not found"] }

        switch field {
        case "title":
            r.title = value
        case "notes":
            var newNotes = value
            let currentStatus = statusFromNotes(r.notes)
            let currentEmoji = emojiFromNotes(r.notes)
            if currentStatus != defaultStatus {
                newNotes = setStatusInNotes(newNotes, status: currentStatus)
            }
            if let emoji = currentEmoji {
                newNotes = setEmojiInNotes(newNotes, emoji: emoji)
            }
            r.notes = newNotes
        case "url":
            r.url = value.isEmpty ? nil : URL(string: value)
        case "emoji":
            r.notes = setEmojiInNotes(r.notes, emoji: value.isEmpty ? nil : value)
        default:
            return ["error": "unknown field: \(field)"]
        }
        do { try store.save(r, commit: true); return ["ok": true] }
        catch { return ["error": error.localizedDescription] }

    case "rename-list":
        guard let oldName = cmd["oldName"] as? String,
              let newName = cmd["newName"] as? String,
              let cal = store.calendars(for: .reminder).first(where: { $0.title == oldName })
        else { return ["error": "not found"] }
        cal.title = newName
        do { try store.saveCalendar(cal, commit: true); return ["ok": true] }
        catch { return ["error": error.localizedDescription] }

    case "delete":
        guard let id = cmd["id"] as? String, let r = findReminder(id: id)
        else { return ["error": "not found"] }
        do { try store.remove(r, commit: true); return ["ok": true] }
        catch { return ["error": error.localizedDescription] }

    case "create-list":
        guard let name = cmd["name"] as? String else { return ["error": "no name"] }
        let newCal = EKCalendar(for: .reminder, eventStore: store)
        newCal.title = name
        newCal.source = store.defaultCalendarForNewReminders()?.source
        do { try store.saveCalendar(newCal, commit: true); return ["ok": true] }
        catch { return ["error": error.localizedDescription] }

    default:
        return ["error": "unknown action: \(action)"]
    }
}

// ── Main: stdin/stdout JSON-RPC loop ───────────────
guard requestAccess() else {
    let err = try! JSONSerialization.data(withJSONObject: ["error": "permission_denied"])
    FileHandle.standardOutput.write(err)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    exit(1)
}

// 发送 ready 信号
let ready = try! JSONSerialization.data(withJSONObject: ["ready": true])
FileHandle.standardOutput.write(ready)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)

// 逐行读 JSON 命令，处理，输出 JSON 响应
while let line = readLine() {
    guard let data = line.data(using: .utf8),
          let cmd = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
        let err = try! JSONSerialization.data(withJSONObject: ["error": "invalid json"])
        FileHandle.standardOutput.write(err)
        FileHandle.standardOutput.write("\n".data(using: .utf8)!)
        continue
    }

    let result = handleCommand(cmd)
    if let jsonData = try? JSONSerialization.data(withJSONObject: result) {
        FileHandle.standardOutput.write(jsonData)
        FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    }
}
