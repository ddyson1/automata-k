import Foundation
import Observation

/// Game state: the machine on the canvas per level, undo and redo, and
/// progress.
///
/// What you draw lives for the session and no longer, exactly as on the web.
/// Arriving at a level and finding a machine from a sitting you no longer
/// remember is indistinguishable from a puzzle that came half solved, so the
/// canvas is memory and only progress reaches disk.
///
/// Progress is UserDefaults and nothing else: no account, no analytics, no
/// network call anywhere in this app.
@Observable
final class Store {

    struct Progress: Codable {
        var solved: [String] = []
        var shownSolution: [String] = []
        var bestStates: [String: Int] = [:]
    }

    private struct Draft {
        var machine: Machine
        var past: [Machine] = []
        var future: [Machine] = []
    }

    private static let progressKey = "automata-k.progress.v1"
    private static let historyLimit = 60

    private(set) var progress = Progress()
    let levels: [GoldenLevel]

    private var drafts: [String: Draft] = [:]

    init(levels: [GoldenLevel]) {
        self.levels = levels
        if let data = UserDefaults.standard.data(forKey: Self.progressKey),
           let saved = try? JSONDecoder().decode(Progress.self, from: data) {
            progress = saved
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(progress) {
            UserDefaults.standard.set(data, forKey: Self.progressKey)
        }
    }

    // MARK: - reads

    func machine(for levelID: String) -> Machine {
        drafts[levelID]?.machine ?? Machine()
    }

    func isSolved(_ levelID: String) -> Bool { progress.solved.contains(levelID) }
    func wasShown(_ levelID: String) -> Bool { progress.shownSolution.contains(levelID) }
    func best(_ levelID: String) -> Int? { progress.bestStates[levelID] }

    func canUndo(_ levelID: String) -> Bool { !(drafts[levelID]?.past.isEmpty ?? true) }
    func canRedo(_ levelID: String) -> Bool { !(drafts[levelID]?.future.isEmpty ?? true) }

    func level(id: String) -> GoldenLevel? { levels.first { $0.id == id } }

    /// Levels unlock in order: level n is playable once level n-1 is solved.
    func isUnlocked(_ level: GoldenLevel) -> Bool {
        if level.index == 1 { return true }
        guard let previous = levels.first(where: { $0.index == level.index - 1 }) else { return true }
        return isSolved(previous.id)
    }

    func nextLevel(after levelID: String) -> GoldenLevel? {
        guard let here = level(id: levelID) else { return nil }
        return levels.first { $0.index == here.index + 1 }
    }

    // MARK: - edits

    /// Apply an edit, pushing the previous machine onto the undo stack. The
    /// canvas is session state, so nothing here touches storage.
    private func edit(_ levelID: String, _ change: (inout Machine) -> Void) {
        var draft = drafts[levelID] ?? Draft(machine: Machine())
        let before = draft.machine
        var after = draft.machine
        change(&after)
        draft.machine = after
        draft.past.append(before)
        if draft.past.count > Self.historyLimit { draft.past.removeFirst() }
        draft.future = []
        drafts[levelID] = draft
    }

    /// A label the machine is not already using: q0, q1, q2 and so on.
    private func nextLabel(_ m: Machine) -> String {
        let taken = Set(m.states.map(\.label))
        var n = 0
        while taken.contains("q\(n)") { n += 1 }
        return "q\(n)"
    }

    private func nextID(_ existing: [String], _ prefix: String) -> String {
        let taken = Set(existing)
        var n = 0
        while taken.contains("\(prefix)\(n)") { n += 1 }
        return "\(prefix)\(n)"
    }

    @discardableResult
    func addState(_ levelID: String, x: Double, y: Double) -> String {
        let current = machine(for: levelID)
        let id = nextID(current.states.map(\.id), "s")
        let label = nextLabel(current)
        edit(levelID) { m in
            m.states.append(AutomatonState(id: id, label: label, x: x, y: y))
            if m.start == nil { m.start = id }
        }
        return id
    }

    func moveState(_ levelID: String, id: String, x: Double, y: Double) {
        edit(levelID) { m in
            guard let i = m.states.firstIndex(where: { $0.id == id }) else { return }
            m.states[i].x = x
            m.states[i].y = y
        }
    }

    func deleteState(_ levelID: String, id: String) {
        edit(levelID) { m in
            m.states.removeAll { $0.id == id }
            m.transitions.removeAll { $0.from == id || $0.to == id }
            m.accepting.removeAll { $0 == id }
            if m.start == id { m.start = m.states.first?.id }
        }
    }

    func setStart(_ levelID: String, id: String) {
        edit(levelID) { $0.start = id }
    }

    func toggleAccepting(_ levelID: String, id: String) {
        edit(levelID) { m in
            if let i = m.accepting.firstIndex(of: id) {
                m.accepting.remove(at: i)
            } else {
                m.accepting.append(id)
            }
        }
    }

    func rename(_ levelID: String, id: String, to label: String) {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        edit(levelID) { m in
            guard let i = m.states.firstIndex(where: { $0.id == id }) else { return }
            m.states[i].label = trimmed
        }
    }

    @discardableResult
    func addTransition(_ levelID: String, _ draft: Transition) -> String {
        let current = machine(for: levelID)
        let id = nextID(current.transitions.map(\.id), "t")
        edit(levelID) { m in
            var t = draft
            t.id = id
            m.transitions.append(t)
        }
        return id
    }

    func updateTransition(_ levelID: String, id: String, _ draft: Transition) {
        edit(levelID) { m in
            guard let i = m.transitions.firstIndex(where: { $0.id == id }) else { return }
            var t = draft
            t.id = id
            m.transitions[i] = t
        }
    }

    func deleteTransition(_ levelID: String, id: String) {
        edit(levelID) { m in
            m.transitions.removeAll { $0.id == id }
        }
    }

    func tidy(_ levelID: String) {
        edit(levelID) { m in
            let points = Layout.layoutMachine(m)
            for (i, p) in points.enumerated() where i < m.states.count {
                m.states[i].x = p.x
                m.states[i].y = p.y
            }
        }
    }

    func clear(_ levelID: String) {
        edit(levelID) { $0 = Machine() }
    }

    func reveal(_ levelID: String) {
        guard let level = level(id: levelID) else { return }
        if !progress.shownSolution.contains(levelID) {
            progress.shownSolution.append(levelID)
            persist()
        }
        edit(levelID) { $0 = level.solution }
    }

    func undo(_ levelID: String) {
        guard var draft = drafts[levelID], let previous = draft.past.popLast() else { return }
        draft.future.insert(draft.machine, at: 0)
        if draft.future.count > Self.historyLimit { draft.future.removeLast() }
        draft.machine = previous
        drafts[levelID] = draft
    }

    func redo(_ levelID: String) {
        guard var draft = drafts[levelID], !draft.future.isEmpty else { return }
        let next = draft.future.removeFirst()
        draft.past.append(draft.machine)
        draft.machine = next
        drafts[levelID] = draft
    }

    // MARK: - progress

    func markSolved(_ levelID: String, stateCount: Int) {
        if !progress.solved.contains(levelID) { progress.solved.append(levelID) }
        let best = progress.bestStates[levelID]
        progress.bestStates[levelID] = best.map { min($0, stateCount) } ?? stateCount
        persist()
    }

    func resetProgress() {
        progress = Progress()
        drafts = [:]
        persist()
    }
}
