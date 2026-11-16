package ua.hospital3.prozorro

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Налаштування (спільні для веб-інтерфейсу та фонової перевірки) і стан останньої перевірки.
 *
 * settings = {"edrpous":["05503705"], "watched":[{"id":"UA-...","title":"..."}],
 *             "notify":true, "intervalHours":3}
 */
object Prefs {
    private const val NAME = "monitor"
    private const val KEY_SETTINGS = "settings"
    private const val KEY_STATE = "state"

    const val DEFAULT_SETTINGS =
        """{"edrpous":["05503705"],"watched":[],"notify":true,"intervalHours":3}"""

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun settingsJson(ctx: Context): String =
        prefs(ctx).getString(KEY_SETTINGS, null) ?: DEFAULT_SETTINGS

    fun settings(ctx: Context): JSONObject = try {
        JSONObject(settingsJson(ctx))
    } catch (e: Exception) {
        JSONObject(DEFAULT_SETTINGS)
    }

    fun saveSettings(ctx: Context, json: String) {
        val incoming = JSONObject(json) // перевірка, що це валідний JSON
        val old = settings(ctx)
        prefs(ctx).edit().putString(KEY_SETTINGS, incoming.toString()).apply()
        // Якщо змінився перелік замовників — не засипати сповіщеннями про "нові" закупівлі.
        if (edrpous(old) != edrpous(incoming)) {
            val st = state(ctx)
            st.put("init", false)
            st.put("t", JSONObject())
            saveState(ctx, st)
        }
    }

    fun state(ctx: Context): JSONObject = try {
        JSONObject(prefs(ctx).getString(KEY_STATE, null) ?: "{}")
    } catch (e: Exception) {
        JSONObject()
    }

    fun saveState(ctx: Context, state: JSONObject) {
        prefs(ctx).edit().putString(KEY_STATE, state.toString()).apply()
    }

    fun edrpous(settings: JSONObject): List<String> {
        val arr = settings.optJSONArray("edrpous") ?: JSONArray()
        val out = mutableListOf<String>()
        for (i in 0 until arr.length()) {
            val code = arr.optString(i).filter { it.isDigit() }
            if (code.length in 6..10) out.add(code)
        }
        return out
    }

    /** Ідентифікатори відстежуваних тендерів (UA-2025-...). */
    fun watched(settings: JSONObject): List<String> {
        val arr = settings.optJSONArray("watched") ?: JSONArray()
        val out = mutableListOf<String>()
        for (i in 0 until arr.length()) {
            val item = arr.opt(i)
            val id = when (item) {
                is JSONObject -> item.optString("id")
                is String -> item
                else -> ""
            }
            if (id.isNotBlank()) out.add(id.trim())
        }
        return out
    }
}
