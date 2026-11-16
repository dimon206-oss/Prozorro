package ua.hospital3.prozorro

object Labels {
    private val statuses = mapOf(
        "active.enquiries" to "Період уточнень",
        "active.tendering" to "Подання пропозицій",
        "active.pre-qualification" to "Прекваліфікація",
        "active.pre-qualification.stand-still" to "Прекваліфікація (оскарження)",
        "active.auction" to "Аукціон",
        "active.qualification" to "Кваліфікація переможця",
        "active.qualification.stand-still" to "Кваліфікація (оскарження)",
        "active.awarded" to "Пропозиції розглянуто",
        "active" to "Активна",
        "complete" to "Завершена",
        "unsuccessful" to "Не відбулася",
        "cancelled" to "Відмінена",
        "draft" to "Чернетка",
    )

    fun status(code: String): String = statuses[code] ?: code.ifBlank { "—" }
}
