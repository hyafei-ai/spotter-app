// MessagesView.swift — W11: the coach's last messages, and a reply by quick reply or dictation.
// NOT COMPILED OR RUN HERE.

import SwiftUI
import WatchKit

struct MessagesView: View {
    @EnvironmentObject private var link: PhoneLink

    var body: some View {
        let messages = link.context?.messages ?? []
        List {
            if messages.isEmpty {
                Text("\(link.brand.coachFirst) hasn’t written yet.").foregroundStyle(Ink.ink2)
            }
            ForEach(messages.reversed()) { m in
                NavigationLink {
                    MessageView(message: m)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.from == "coach" ? link.brand.coachFirst : "You").font(.footnote).foregroundStyle(Ink.ink2)
                        Text(m.body).font(.body).foregroundStyle(Ink.ink).lineLimit(3)
                    }
                }
            }
        }
        .navigationTitle(link.brand.coachFirst)
    }
}

struct MessageView: View {
    @EnvironmentObject private var link: PhoneLink
    let message: WatchMessage
    @State private var sent: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(message.body).font(.body).foregroundStyle(Ink.ink)
                if let sent {
                    Label(link.pending > 0 ? "Sends when your iPhone is near" : "Sent", systemImage: "checkmark")
                        .font(.footnote).foregroundStyle(link.pending > 0 ? Ink.warning : Ink.success)
                    Text("“\(sent)”").font(.footnote).foregroundStyle(Ink.ink2)
                } else if message.from == "coach" {
                    // Quick replies first (one tap), then dictation / Scribble through the system text input.
                    ForEach(link.context?.quickReplies ?? [], id: \.self) { r in
                        Button(r) { reply(r) }.buttonStyle(.bordered)
                    }
                    TextFieldLink(prompt: Text("Reply to \(link.brand.coachFirst)")) {
                        Label("Dictate", systemImage: "mic")
                    } onSubmit: { text in
                        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !t.isEmpty { reply(String(t.prefix(500))) }
                    }
                }
            }
        }
    }

    private func reply(_ body: String) {
        link.send(Reply(id: Wire.newId(), body: body, sentAt: Wire.stamp()))
        WKInterfaceDevice.current().play(.success)
        sent = body
    }
}
