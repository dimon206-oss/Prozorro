package ua.hospital3.prozorro

import java.net.HttpURLConnection
import java.net.URL

/**
 * HTTP-запити до відкритих API Prozorro.
 * Дозволені лише хости Prozorro — веб-частина додатка не може звертатися деінде.
 */
object Net {
    private val allowedHosts = setOf(
        "prozorro.gov.ua",
        "public-api.prozorro.gov.ua",
        "risks.prozorro.gov.ua",
        "audit-api.prozorro.gov.ua",
    )

    data class Resp(val code: Int, val body: String)

    fun isAllowed(url: String): Boolean = try {
        val u = URL(url)
        u.protocol == "https" && u.host in allowedHosts
    } catch (e: Exception) {
        false
    }

    fun request(method: String, url: String, body: String?): Resp {
        if (!isAllowed(url)) throw IllegalArgumentException("Адреса не дозволена: $url")
        var lastError: Exception? = null
        for (attempt in 0 until 3) {
            try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.requestMethod = method
                conn.connectTimeout = 20_000
                conn.readTimeout = 40_000
                conn.setRequestProperty("Accept", "application/json")
                conn.setRequestProperty("User-Agent", "ProzorroMonitor/1.0 (Android)")
                if (body != null && method == "POST") {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                }
                val code = conn.responseCode
                val stream = if (code >= 400) conn.errorStream else conn.inputStream
                val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                conn.disconnect()
                if (code == 429 || code >= 500) {
                    lastError = RuntimeException("Сервер Prozorro відповів HTTP $code")
                    Thread.sleep(2_000L * (attempt + 1))
                    continue
                }
                return Resp(code, text)
            } catch (e: Exception) {
                lastError = e
                Thread.sleep(1_000L * (attempt + 1))
            }
        }
        throw lastError ?: RuntimeException("Помилка мережі")
    }
}
