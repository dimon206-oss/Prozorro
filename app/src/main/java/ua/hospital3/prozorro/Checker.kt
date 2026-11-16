package ua.hospital3.prozorro

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class Event(val title: String, val text: String, val tenderId: String)

/**
 * Порівнює поточний стан закупівель із збереженим і повертає події для сповіщень:
 *  - нова закупівля замовника (серед 20 останніх);
 *  - зміна статусу закупівлі замовника;
 *  - будь-яка зміна у відстежуваній ("зірочка") закупівлі.
 */
object Checker {
    private const val SEARCH_URL = "https://prozorro.gov.ua/api/search/tenders?page=1"
    private const val MAX_SEEN = 600

    fun run(ctx: Context): List<Event> {
        val settings = Prefs.settings(ctx)
        val state = Prefs.state(ctx)
        val seen = state.optJSONObject("t") ?: JSONObject()
        val watchedState = state.optJSONObject("w") ?: JSONObject()
        val initialized = state.optBoolean("init", false)
        val events = mutableListOf<Event>()

        val watched = Prefs.watched(settings)
        val watchedSet = watched.toSet()

        // 1. Відстежувані закупівлі — детально, за датою зміни.
        for (id in watched) {
            val r = try {
                Net.request("GET", "https://prozorro.gov.ua/api/tenders/$id/summary", null)
            } catch (e: Exception) {
                continue
            }
            if (r.code !in 200..299) continue
            val s = try { JSONObject(r.body) } catch (e: Exception) { continue }
            val status = s.optString("status")
            val modified = s.optString("dateModified")
            val title = s.optString("title").ifBlank { id }
            val key = "$status|$modified"
            val old = watchedState.optString(id, "")
            if (old.isNotEmpty() && old != key) {
                val oldStatus = old.substringBefore("|")
                events += if (oldStatus != status) {
                    Event(
                        "★ ${Labels.status(status)}",
                        "$title\n${Labels.status(oldStatus)} → ${Labels.status(status)}",
                        id,
                    )
                } else {
                    Event("★ Оновлення у закупівлі", "$title\nЗмінено: ${shortDate(modified)}", id)
                }
            }
            watchedState.put(id, key)
            seen.put(id, status)
        }

        // 2. Останні закупівлі замовника(ів).
        val edrpous = Prefs.edrpous(settings)
        if (edrpous.isNotEmpty()) {
            val body = JSONObject().put("buyer", JSONArray(edrpous)).toString()
            val r = Net.request("POST", SEARCH_URL, body)
            if (r.code in 200..299) {
                val data = JSONObject(r.body).optJSONArray("data") ?: JSONArray()
                for (i in 0 until data.length()) {
                    val t = data.optJSONObject(i) ?: continue
                    val id = t.optString("tenderID")
                    if (id.isBlank()) continue
                    val status = t.optString("status")
                    val title = t.optString("title").ifBlank { id }
                    val old = seen.optString(id, "")
                    if (old.isEmpty()) {
                        if (initialized) {
                            events += Event("Нова закупівля", "$title\n${Labels.status(status)}", id)
                        }
                    } else if (old != status && id !in watchedSet) {
                        events += Event(
                            Labels.status(status),
                            "$title\n${Labels.status(old)} → ${Labels.status(status)}",
                            id,
                        )
                    }
                    seen.put(id, status)
                }
            } else {
                throw RuntimeException("Пошук Prozorro: HTTP ${r.code}")
            }
        }

        trim(seen)
        state.put("t", seen)
        state.put("w", watchedState)
        state.put("init", true)
        state.put("lastCheck", System.currentTimeMillis())
        Prefs.saveState(ctx, state)
        return events
    }

    private fun trim(obj: JSONObject) {
        if (obj.length() <= MAX_SEEN) return
        val keys = obj.keys().asSequence().toList().sorted() // UA-РРРР-ММ-ДД-... сортуються за датою
        keys.take(obj.length() - MAX_SEEN).forEach { obj.remove(it) }
    }

    private fun shortDate(iso: String): String {
        // 2025-08-26T12:39:14.123+03:00 -> 26.08.2025 12:39
        if (iso.length < 16) return iso
        return "${iso.substring(8, 10)}.${iso.substring(5, 7)}.${iso.substring(0, 4)} ${iso.substring(11, 16)}"
    }
}
