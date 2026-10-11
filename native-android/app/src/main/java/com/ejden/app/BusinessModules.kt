package com.ejden.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.NumberFormat
import java.util.Locale

private val BusinessBlue = Color(0xFF176B87)
private val BusinessBg = Color(0xFFF5F7F8)
private val BusinessInk = Color(0xFF172126)
private val BusinessMuted = Color(0xFF68777D)
private val BusinessBorder = Color(0xFFE2E8EA)

private fun businessMoney(value: Long): String =
    NumberFormat.getIntegerInstance(Locale.FRANCE).format(value) + " FCFA"

private data class BProduct(
    val id: Long,
    val name: String,
    val purchase: Long,
    val sale: Long,
    val stock: Int,
    val barcode: String = ""
)

private data class BContact(
    val id: Long,
    val name: String,
    val phone: String,
    val debt: Long = 0
)

private data class BRecord(
    val id: Long,
    val title: String,
    val subtitle: String,
    val amount: Long,
    val date: Long
)

private class EjdenBusinessDb(context: Context) :
    SQLiteOpenHelper(context, "ejden_products.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        createTables(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        createTables(db)
    }

    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        createTables(db)
    }

    private fun createTables(db: SQLiteDatabase) {
        // La table products conserve le même schéma que ProductsScreen.kt.
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                purchase_price INTEGER NOT NULL,
                sale_price INTEGER NOT NULL,
                stock INTEGER NOT NULL,
                threshold INTEGER NOT NULL DEFAULT 0,
                barcode TEXT NOT NULL DEFAULT ''
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS ejden_clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                phone TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS ejden_suppliers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                phone TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS ejden_sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                total INTEGER NOT NULL,
                paid INTEGER NOT NULL,
                client_name TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                payment_method TEXT NOT NULL DEFAULT 'cash'
            )
        """.trimIndent())

        // Migration sans suppression des ventes déjà enregistrées.
        try {
            db.execSQL(
                "ALTER TABLE ejden_sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'"
            )
        } catch (_: Exception) {
            // La colonne existe déjà.
        }

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS ejden_cash_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                reason TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                created_at INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS ejden_purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                supplier_name TEXT NOT NULL,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                total INTEGER NOT NULL,
                paid INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )
        """.trimIndent())
    }

    fun products(): List<BProduct> {
        val result = mutableListOf<BProduct>()
        readableDatabase.rawQuery(
            "SELECT id,name,purchase_price,sale_price,stock,barcode FROM products ORDER BY name COLLATE NOCASE",
            null
        ).use { c ->
            while (c.moveToNext()) result += BProduct(
                c.getLong(0), c.getString(1), c.getLong(2), c.getLong(3), c.getInt(4), c.getString(5)
            )
        }
        return result
    }

    fun contacts(table: String): List<BContact> {
        require(table == "ejden_clients" || table == "ejden_suppliers")
        val result = mutableListOf<BContact>()
        readableDatabase.rawQuery(
            "SELECT id,name,phone,created_at FROM $table ORDER BY name COLLATE NOCASE",
            null
        ).use { c ->
            while (c.moveToNext()) result += BContact(
                c.getLong(0), c.getString(1), c.getString(2)
            )
        }
        if (table == "ejden_clients") {
            result.forEach { contact ->
                val debt = readableDatabase.rawQuery(
                    "SELECT COALESCE(SUM(total-paid),0) FROM ejden_sales WHERE client_name=?",
                    arrayOf(contact.name)
                ).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }
                val index = result.indexOfFirst { it.id == contact.id }
                if (index >= 0) result[index] = contact.copy(debt = debt)
            }
        } else {
            result.forEach { contact ->
                val debt = readableDatabase.rawQuery(
                    "SELECT COALESCE(SUM(total-paid),0) FROM ejden_purchases WHERE supplier_id=?",
                    arrayOf(contact.id.toString())
                ).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }
                val index = result.indexOfFirst { it.id == contact.id }
                if (index >= 0) result[index] = contact.copy(debt = debt)
            }
        }
        return result
    }

    fun saveContact(table: String, id: Long, name: String, phone: String): String? {
        require(table == "ejden_clients" || table == "ejden_suppliers")
        if (name.isBlank()) return "Le nom est obligatoire."
        val values = ContentValues().apply {
            put("name", name.trim())
            put("phone", phone.trim())
            if (id == 0L) put("created_at", System.currentTimeMillis())
        }
        return try {
            if (id == 0L) writableDatabase.insertOrThrow(table, null, values)
            else writableDatabase.update(table, values, "id=?", arrayOf(id.toString()))
            null
        } catch (_: Exception) {
            "Ce nom existe déjà ou n'a pas pu être enregistré."
        }
    }

    fun deleteContact(table: String, id: Long) {
        require(table == "ejden_clients" || table == "ejden_suppliers")
        writableDatabase.delete(table, "id=?", arrayOf(id.toString()))
    }

    fun cashBalance(): Long {
        return readableDatabase.rawQuery(
            "SELECT COALESCE(SUM(CASE WHEN type='in' THEN amount ELSE -amount END),0) FROM ejden_cash_entries",
            null
        ).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }
    }

    fun cashToday(type: String): Long {
        val start = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 0)
            set(java.util.Calendar.MINUTE, 0)
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }.timeInMillis
        return readableDatabase.rawQuery(
            "SELECT COALESCE(SUM(amount),0) FROM ejden_cash_entries WHERE type=? AND created_at>=?",
            arrayOf(type, start.toString())
        ).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }
    }

    fun addCash(type: String, amount: Long, reason: String, source: String = "manual"): String? {
        if (amount <= 0) return "Le montant doit être supérieur à zéro."
        if (type == "out" && cashBalance() < amount) {
            return "Solde insuffisant pour cette sortie."
        }
        val values = ContentValues().apply {
            put("type", type)
            put("amount", amount)
            put("reason", reason.trim().ifBlank { "Mouvement de caisse" })
            put("source", source)
            put("created_at", System.currentTimeMillis())
        }
        writableDatabase.insertOrThrow("ejden_cash_entries", null, values)
        return null
    }

    fun cashRecords(): List<BRecord> = records(
        "SELECT id,reason,type,amount,created_at FROM ejden_cash_entries ORDER BY id DESC"
    ) { c ->
        BRecord(c.getLong(0), c.getString(1), if (c.getString(2) == "in") "Entrée" else "Sortie",
            c.getLong(3), c.getLong(4))
    }

    private fun records(sql: String, read: (android.database.Cursor) -> BRecord): List<BRecord> {
        val result = mutableListOf<BRecord>()
        readableDatabase.rawQuery(sql, null).use { c ->
            while (c.moveToNext()) result += read(c)
        }
        return result
    }

    fun saveSale(product: BProduct, quantity: Int, paid: Long, client: String): String? {
        if (quantity < 1) return "La quantité doit être supérieure à zéro."
        if (product.stock < quantity) return "Stock insuffisant."
        val total = product.sale * quantity
        if (paid < 0 || paid > total) return "Vérifie le montant payé."
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.execSQL(
                "UPDATE products SET stock=stock-? WHERE id=? AND stock>=?",
                arrayOf(quantity, product.id, quantity)
            )
            val current = readableDatabase.rawQuery(
                "SELECT stock FROM products WHERE id=?", arrayOf(product.id.toString())
            ).use { c -> c.moveToFirst() && c.getInt(0) >= 0 }
            if (!current) {
                db.endTransaction()
                return "Stock insuffisant."
            }
            val values = ContentValues().apply {
                put("product_id", product.id)
                put("product_name", product.name)
                put("quantity", quantity)
                put("total", total)
                put("paid", paid)
                put("client_name", client.trim())
                put("created_at", System.currentTimeMillis())
            }
            db.insertOrThrow("ejden_sales", null, values)
            if (paid > 0) {
                val cash = ContentValues().apply {
                    put("type", "in")
                    put("amount", paid)
                    put("reason", "Vente : ${product.name}")
                    put("source", "sale")
                    put("created_at", System.currentTimeMillis())
                }
                db.insertOrThrow("ejden_cash_entries", null, cash)
            }
            db.setTransactionSuccessful()
        } catch (e: Exception) {
            return "Impossible d'enregistrer la vente."
        } finally {
            if (db.inTransaction()) db.endTransaction()
        }
        return null
    }

    fun saveSaleCart(
        lines: List<Pair<BProduct, Int>>,
        paid: Long,
        client: String,
        discount: Long,
        paymentMethod: String
    ): String? {
        if (lines.isEmpty()) return "Ajoute au moins un produit."
        if (lines.any { it.second < 1 }) return "Vérifie les quantités."

        val allowedMethods = setOf("cash", "mobile_money", "card", "other", "credit")
        if (paymentMethod !in allowedMethods) return "Moyen de paiement invalide."

        val subtotal = lines.sumOf { (product, quantity) -> product.sale * quantity }
        if (discount < 0 || discount >= subtotal) {
            return "La remise doit être inférieure au sous-total."
        }

        val total = subtotal - discount
        if (paid < 0 || paid > total) return "Vérifie le montant payé."

        val db = writableDatabase
        val now = System.currentTimeMillis()
        db.beginTransaction()
        try {
            var remainingDiscount = discount
            var remainingPaid = paid
            var remainingNet = total

            lines.forEachIndexed { index, (product, quantity) ->
                val changed = db.update(
                    "products",
                    ContentValues().apply {
                        put("stock", product.stock - quantity)
                    },
                    "id=? AND stock>=?",
                    arrayOf(product.id.toString(), quantity.toString())
                )
                if (changed != 1) {
                    throw IllegalStateException("Stock insuffisant pour ${product.name}.")
                }

                val lineGross = product.sale * quantity
                val lineDiscount = if (index == lines.lastIndex) {
                    remainingDiscount
                } else {
                    (discount * lineGross / subtotal).coerceAtMost(remainingDiscount)
                }
                remainingDiscount -= lineDiscount
                val lineNet = lineGross - lineDiscount

                val linePaid = if (index == lines.lastIndex) {
                    remainingPaid
                } else if (remainingNet > 0) {
                    (remainingPaid * lineNet / remainingNet).coerceAtMost(remainingPaid)
                } else {
                    0L
                }
                remainingPaid -= linePaid
                remainingNet -= lineNet

                val values = ContentValues().apply {
                    put("product_id", product.id)
                    put("product_name", product.name)
                    put("quantity", quantity)
                    put("total", lineNet)
                    put("paid", linePaid)
                    put("client_name", client.trim())
                    put("created_at", now)
                    put("payment_method", paymentMethod)
                }
                db.insertOrThrow("ejden_sales", null, values)
            }

            if (paid > 0) {
                val cash = ContentValues().apply {
                    put("type", "in")
                    put("amount", paid)
                    put("reason", "Encaissement d'une vente")
                    put("source", "sale")
                    put("created_at", now)
                }
                db.insertOrThrow("ejden_cash_entries", null, cash)
            }

            db.setTransactionSuccessful()
        } catch (e: Exception) {
            return e.message ?: "Impossible d'enregistrer la vente."
        } finally {
            if (db.inTransaction()) db.endTransaction()
        }
        return null
    }

    fun savePurchase(
        supplier: BContact, product: BProduct, quantity: Int, paid: Long
    ): String? {
        if (quantity < 1) return "La quantité doit être supérieure à zéro."
        if (paid < 0 || paid > product.purchase * quantity) return "Vérifie le montant payé."
        val total = product.purchase * quantity
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.execSQL("UPDATE products SET stock=stock+? WHERE id=?", arrayOf(quantity, product.id))
            val values = ContentValues().apply {
                put("supplier_id", supplier.id)
                put("supplier_name", supplier.name)
                put("product_id", product.id)
                put("product_name", product.name)
                put("quantity", quantity)
                put("total", total)
                put("paid", paid)
                put("created_at", System.currentTimeMillis())
            }
            db.insertOrThrow("ejden_purchases", null, values)
            if (paid > 0) {
                val cash = ContentValues().apply {
                    put("type", "out")
                    put("amount", paid)
                    put("reason", "Achat fournisseur : ${supplier.name}")
                    put("source", "purchase")
                    put("created_at", System.currentTimeMillis())
                }
                db.insertOrThrow("ejden_cash_entries", null, cash)
            }
            db.setTransactionSuccessful()
        } catch (_: Exception) {
            return "Impossible d'enregistrer l'achat."
        } finally {
            if (db.inTransaction()) db.endTransaction()
        }
        return null
    }

    fun sales(): List<BRecord> = records(
        "SELECT id,product_name,quantity,total,created_at FROM ejden_sales ORDER BY id DESC"
    ) { c ->
        BRecord(c.getLong(0), c.getString(1), "Quantité : ${c.getInt(2)}",
            c.getLong(3), c.getLong(4))
    }

    fun purchases(): List<BRecord> = records(
        "SELECT id,supplier_name,product_name,total,created_at FROM ejden_purchases ORDER BY id DESC"
    ) { c ->
        BRecord(c.getLong(0), c.getString(1), c.getString(2),
            c.getLong(3), c.getLong(4))
    }
}

@Composable
internal fun BusinessModuleScreen(module: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val db = remember { EjdenBusinessDb(context.applicationContext) }
    val current = module
    var revision by remember { mutableIntStateOf(0) }
    var search by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("1") }
    var paid by remember { mutableStateOf("") }
    var clientName by remember { mutableStateOf("") }
    var selectedProduct by remember { mutableStateOf<BProduct?>(null) }
    var selectedContact by remember { mutableStateOf<BContact?>(null) }
    var showProductMenu by remember { mutableStateOf(false) }
    var showContactMenu by remember { mutableStateOf(false) }
    var cashType by remember { mutableStateOf("in") }
    var message by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<BContact?>(null) }
    var cart by remember { mutableStateOf<List<Pair<BProduct, Int>>>(emptyList()) }
    var showCart by remember { mutableStateOf(false) }
    var showCheckout by remember { mutableStateOf(false) }
    var showSalesHistory by remember { mutableStateOf(false) }
    var showScannerDialog by remember { mutableStateOf(false) }
    var barcodeQuery by remember { mutableStateOf("") }
    var discountText by remember { mutableStateOf("0") }
    var paymentMethod by remember { mutableStateOf("cash") }


    val products = remember(revision) { db.products() }
    val clients = remember(revision) { db.contacts("ejden_clients") }
    val suppliers = remember(revision) { db.contacts("ejden_suppliers") }
    val title = when {
        current == "ventes" && showSalesHistory -> "Historique des ventes"
        current == "ventes" -> "Nouvelle vente"
        current == "caisse" -> "Caisse"
        current == "clients" -> "Clients"
        current == "achats" -> "Achats"
        else -> "Fournisseurs"
    }
    /*
    val oldTitle = when (current) {
        "ventes" -> "Ventes"
    */
    val contactTable = if (current == "clients") "ejden_clients" else "ejden_suppliers"
    val cartSubtotal = cart.sumOf { (product, quantity) -> product.sale * quantity }
    val cartDiscount = (discountText.toLongOrNull() ?: 0L).coerceIn(0L, cartSubtotal)
    val cartTotal = (cartSubtotal - cartDiscount).coerceAtLeast(0L)


    BackHandler(onBack = onBack)

    Column(
        Modifier.fillMaxSize().background(BusinessBg)
            .verticalScroll(rememberScrollState()).padding(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Retour")
            }
            Column(Modifier.weight(1f)) {
                Text("EJDEN · GESTION", color = BusinessBlue, fontSize = 10.sp,
                    fontWeight = FontWeight.ExtraBold, letterSpacing = 1.2.sp)
                Text(title, color = BusinessInk, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            if (current == "ventes") {
                TextButton(onClick = {
                    showSalesHistory = !showSalesHistory
                    search = ""
                }) {
                    Text(if (showSalesHistory) "Nouvelle vente" else "Historique")
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        when (current) {
            "ventes" -> {
                if (showSalesHistory) {
                    OutlinedTextField(
                        value = search,
                        onValueChange = { search = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Produit ou client") },
                        singleLine = true
                    )
                    val history = db.sales().filter {
                        search.isBlank() ||
                            it.title.contains(search, true) ||
                            it.subtitle.contains(search, true)
                    }
                    SectionTitle("Ventes enregistrées")
                    RecordList(history)
                    TextButton(onClick = {
                        showSalesHistory = false
                        search = ""
                    }) {
                        Text("Nouvelle vente")
                    }
                } else {
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = search,
                            onValueChange = { search = it },
                            modifier = Modifier.weight(1f),
                            label = { Text("Rechercher un produit") },
                            singleLine = true
                        )
                        Spacer(Modifier.width(8.dp))
                        OutlinedButton(onClick = {
                            barcodeQuery = ""
                            showScannerDialog = true
                        }) {
                            Text("Scanner")
                        }
                    }

                    val availableProducts = products.filter {
                        it.stock > 0 && (
                            search.isBlank() ||
                            it.name.contains(search, true) ||
                            it.barcode.contains(search, true)
                        )
                    }

                    Text(
                        "${availableProducts.size} produit(s)",
                        color = BusinessMuted,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(vertical = 10.dp)
                    )

                    if (availableProducts.isEmpty()) {
                        Card(
                            Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, BusinessBorder)
                        ) {
                            Column(Modifier.padding(18.dp)) {
                                Text(
                                    "Aucun produit disponible",
                                    color = BusinessInk,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    "Ajoute des produits dans le catalogue pour commencer une vente.",
                                    color = BusinessMuted,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }

                    availableProducts.forEach { product ->
                        Card(
                            Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, BusinessBorder)
                        ) {
                            Row(
                                Modifier.fillMaxWidth().padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        product.name,
                                        color = BusinessInk,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        "Stock : ${product.stock}",
                                        color = BusinessMuted,
                                        fontSize = 11.sp
                                    )
                                    Text(
                                        businessMoney(product.sale),
                                        color = BusinessBlue,
                                        fontWeight = FontWeight.ExtraBold
                                    )
                                }
                                Button(
                                    onClick = {
                                        val existing = cart.find { it.first.id == product.id }
                                        if (existing != null) {
                                            cart = cart.map {
                                                if (it.first.id == product.id && it.second < product.stock)
                                                    it.first to (it.second + 1)
                                                else it
                                            }
                                        } else {
                                            cart = cart + (product to 1)
                                        }
                                        message = null
                                    },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = BusinessBlue
                                    )
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = null)
                                    Text("Ajouter")
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = { showCart = true },
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                        enabled = cart.isNotEmpty(),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = BusinessBlue
                        )
                    ) {
                        val count = cart.sumOf { it.second }
                        val total = cart.sumOf { (product, quantity) ->
                            product.sale * quantity
                        }
                        Text("Panier · $count article(s) · ${businessMoney(total)}")
                    }
                    TextButton(onClick = { showSalesHistory = true }) {
                        Text("Historique des ventes")
                    }
                }
            }

            "caisse" -> {
                SummaryCard("Solde actuel", businessMoney(db.cashBalance()))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SummaryCard("Entrées aujourd'hui", businessMoney(db.cashToday("in")), Modifier.weight(1f))
                    SummaryCard("Sorties aujourd'hui", businessMoney(db.cashToday("out")), Modifier.weight(1f))
                }
                SectionTitle("Nouveau mouvement")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(cashType == "in", { cashType = "in" }, label = { Text("Entrée") })
                    FilterChip(cashType == "out", { cashType = "out" }, label = { Text("Sortie") })
                }
                OutlinedTextField(amount, { amount = it.filter(Char::isDigit) },
                    Modifier.fillMaxWidth(), label = { Text("Montant (FCFA)") }, singleLine = true)
                OutlinedTextField(reason, { reason = it },
                    Modifier.fillMaxWidth(), label = { Text("Motif") }, singleLine = true)
                PrimaryAction("Enregistrer le mouvement") {
                    message = db.addCash(cashType, amount.toLongOrNull() ?: 0L, reason)
                    if (message == null) {
                        message = "Mouvement enregistré."
                        amount = ""; reason = ""; revision++
                    }
                }
                SectionTitle("Mouvements récents")
                RecordList(db.cashRecords())
            }

            "clients", "fournisseurs" -> {
                val isClient = current == "clients"
                val contacts = if (isClient) clients else suppliers
                SummaryCard(if (isClient) "Nombre de clients" else "Nombre de fournisseurs", contacts.size.toString())
                if (isClient) {
                    SummaryCard("Total des créances", businessMoney(contacts.sumOf { it.debt }))
                } else {
                    SummaryCard("Total à payer", businessMoney(contacts.sumOf { it.debt }))
                }
                SectionTitle(if (editing == null) {
                    if (isClient) "Nouveau client" else "Nouveau fournisseur"
                } else "Modifier la fiche")
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(),
                    label = { Text("Nom") }, singleLine = true)
                OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(),
                    label = { Text("Téléphone (facultatif)") }, singleLine = true)
                PrimaryAction(if (editing == null) "Ajouter" else "Enregistrer les modifications") {
                    message = db.saveContact(contactTable, editing?.id ?: 0L, name, phone)
                    if (message == null) {
                        message = "Fiche enregistrée."
                        name = ""; phone = ""; editing = null; revision++
                    }
                }
                if (editing != null) {
                    TextButton(onClick = { editing = null; name = ""; phone = "" }) { Text("Annuler") }
                }
                OutlinedTextField(search, { search = it }, Modifier.fillMaxWidth(),
                    label = { Text("Rechercher") }, singleLine = true)
                SectionTitle("Liste")
                contacts.filter { search.isBlank() || it.name.contains(search, true) || it.phone.contains(search) }
                    .forEach { contact ->
                        Card(
                            Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, BusinessBorder)
                        ) {
                            Column(Modifier.fillMaxWidth().padding(14.dp)) {
                                Text(contact.name, color = BusinessInk, fontWeight = FontWeight.Bold)
                                Text(contact.phone.ifBlank { "Pas de téléphone" }, color = BusinessMuted, fontSize = 12.sp)
                                Text(
                                    (if (isClient) "Créance : " else "Reste à payer : ") + businessMoney(contact.debt),
                                    color = BusinessBlue, fontSize = 12.sp
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    TextButton(onClick = {
                                        editing = contact; name = contact.name; phone = contact.phone
                                    }) { Text("Modifier") }
                                    TextButton(onClick = {
                                        db.deleteContact(contactTable, contact.id); revision++
                                        message = "Fiche supprimée."
                                    }) { Icon(Icons.Default.Delete, null); Text("Supprimer") }
                                }
                            }
                        }
                    }
            }

            "achats" -> {
                SummaryCard("Produits disponibles", products.size.toString())
                SectionTitle("Nouvel achat")
                Box {
                    OutlinedTextField(
                        value = selectedContact?.name.orEmpty(),
                        onValueChange = { search = it; showContactMenu = true },
                        modifier = Modifier.fillMaxWidth(), label = { Text("Fournisseur") }, singleLine = true
                    )
                    DropdownMenu(expanded = showContactMenu, onDismissRequest = { showContactMenu = false }) {
                        suppliers.filter { search.isBlank() || it.name.contains(search, true) }.forEach { s ->
                            DropdownMenuItem(text = { Text(s.name) }, onClick = {
                                selectedContact = s; search = ""; showContactMenu = false
                            })
                        }
                    }
                }
                Box {
                    OutlinedTextField(
                        value = selectedProduct?.name.orEmpty(),
                        onValueChange = { search = it; showProductMenu = true },
                        modifier = Modifier.fillMaxWidth(), label = { Text("Produit livré") }, singleLine = true
                    )
                    DropdownMenu(expanded = showProductMenu, onDismissRequest = { showProductMenu = false }) {
                        products.filter { search.isBlank() || it.name.contains(search, true) }.forEach { p ->
                            DropdownMenuItem(text = { Text(p.name) }, onClick = {
                                selectedProduct = p; search = ""; showProductMenu = false
                            })
                        }
                    }
                }
                OutlinedTextField(quantity, { quantity = it.filter(Char::isDigit) },
                    Modifier.fillMaxWidth(), label = { Text("Quantité livrée") }, singleLine = true)
                OutlinedTextField(paid, { paid = it.filter(Char::isDigit) },
                    Modifier.fillMaxWidth(), label = { Text("Payé maintenant (FCFA)") }, singleLine = true)
                selectedProduct?.let {
                    Text("Coût estimé : ${businessMoney(it.purchase * (quantity.toIntOrNull() ?: 0))}",
                        color = BusinessBlue, fontWeight = FontWeight.Bold)
                }
                PrimaryAction("Enregistrer l'achat") {
                    val s = selectedContact
                    val p = selectedProduct
                    if (s == null) message = "Choisis un fournisseur."
                    else if (p == null) message = "Choisis un produit."
                    else {
                        message = db.savePurchase(s, p, quantity.toIntOrNull() ?: 0, paid.toLongOrNull() ?: 0L)
                        if (message == null) {
                            message = "Achat enregistré. Le stock a été augmenté."
                            selectedProduct = null; selectedContact = null
                            quantity = "1"; paid = ""; revision++
                        }
                    }
                }
                SectionTitle("Historique des achats")
                RecordList(db.purchases())
            }
        }

        if (showCart && current == "ventes") {
            AlertDialog(
                onDismissRequest = { showCart = false },
                title = { Text("Panier") },
                text = {
                    Column(
                        Modifier.fillMaxWidth().heightIn(max = 360.dp)
                            .verticalScroll(rememberScrollState())
                    ) {
                        if (cart.isEmpty()) {
                            Text("Votre panier est vide.", color = BusinessMuted)
                        }
                        cart.forEach { (product, quantity) ->
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(product.name, fontWeight = FontWeight.Bold)
                                    Text(
                                        "$quantity × ${businessMoney(product.sale)}",
                                        color = BusinessMuted,
                                        fontSize = 12.sp
                                    )
                                }
                                Text(
                                    businessMoney(product.sale * quantity),
                                    color = BusinessBlue,
                                    fontWeight = FontWeight.Bold
                                )
                                IconButton(onClick = {
                                    cart = cart.filterNot { it.first.id == product.id }
                                }) {
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = "Retirer ${product.name}"
                                    )
                                }
                            }
                            Divider()
                        }
                        Spacer(Modifier.height(8.dp))
                        Text("Sous-total : ${businessMoney(cartSubtotal)}")
                        OutlinedTextField(
                            value = discountText,
                            onValueChange = { discountText = it.filter(Char::isDigit) },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Remise (FCFA)") },
                            singleLine = true
                        )
                        Text(
                            "Total : ${businessMoney(cartTotal)}",
                            color = BusinessBlue,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                },
                confirmButton = {
                    Button(
                        enabled = cart.isNotEmpty() && cartTotal > 0,
                        onClick = {
                            paid = cartTotal.toString()
                            showCart = false
                            showCheckout = true
                        }
                    ) { Text("Encaisser") }
                },
                dismissButton = {
                    TextButton(onClick = { showCart = false }) {
                        Text("Continuer les achats")
                    }
                }
            )
        }

        if (showCheckout && current == "ventes") {
            AlertDialog(
                onDismissRequest = { showCheckout = false },
                title = { Text("Encaissement") },
                text = {
                    Column(
                        Modifier.fillMaxWidth().heightIn(max = 420.dp)
                            .verticalScroll(rememberScrollState())
                    ) {
                        Text("Total à payer", color = BusinessMuted, fontSize = 12.sp)
                        Text(
                            businessMoney(cartTotal),
                            color = BusinessBlue,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 22.sp
                        )
                        Spacer(Modifier.height(12.dp))
                        Text("Moyen de paiement", fontWeight = FontWeight.Bold)
                        listOf(
                            "cash" to "Espèces",
                            "mobile_money" to "Mobile Money",
                            "card" to "Carte",
                            "other" to "Autre",
                            "credit" to "Crédit"
                        ).forEach { (key, label) ->
                            Row(
                                Modifier.fillMaxWidth().clickable {
                                    paymentMethod = key
                                    if (key == "credit" && paid == cartTotal.toString()) paid = "0"
                                }.padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(
                                    selected = paymentMethod == key,
                                    onClick = {
                                        paymentMethod = key
                                        if (key == "credit" && paid == cartTotal.toString()) paid = "0"
                                    }
                                )
                                Text(label)
                            }
                        }
                        OutlinedTextField(
                            value = clientName,
                            onValueChange = { clientName = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Client (facultatif)") },
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = paid,
                            onValueChange = { paid = it.filter(Char::isDigit) },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Montant reçu (FCFA)") },
                            singleLine = true
                        )
                        Text(
                            "Reste à payer : ${businessMoney((cartTotal - (paid.toLongOrNull() ?: 0L)).coerceAtLeast(0L))}",
                            color = BusinessMuted,
                            fontSize = 12.sp
                        )
                    }
                },
                confirmButton = {
                    Button(
                        enabled = cart.isNotEmpty() &&
                            (paid.toLongOrNull() ?: -1L) in 0..cartTotal &&
                            cartTotal > 0,
                        onClick = {
                            val error = db.saveSaleCart(
                                cart,
                                paid.toLongOrNull() ?: 0L,
                                clientName,
                                cartDiscount,
                                paymentMethod
                            )
                            message = error ?: "Vente enregistrée."
                            if (error == null) {
                                cart = emptyList()
                                clientName = ""
                                paid = ""
                                discountText = "0"
                                paymentMethod = "cash"
                                revision++
                                showCheckout = false
                            }
                        }
                    ) { Text("Confirmer la vente") }
                },
                dismissButton = {
                    TextButton(onClick = {
                        showCheckout = false
                        showCart = true
                    }) { Text("Retour au panier") }
                }
            )
        }

        if (showScannerDialog && current == "ventes") {
            AlertDialog(
                onDismissRequest = { showScannerDialog = false },
                title = { Text("Scanner un produit") },
                text = {
                    Column {
                        Text(
                            "La lecture caméra n'est pas encore intégrée. Tu peux rechercher un produit par son code-barres.",
                            color = BusinessMuted,
                            fontSize = 12.sp
                        )
                        OutlinedTextField(
                            value = barcodeQuery,
                            onValueChange = { barcodeQuery = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Code-barres") },
                            singleLine = true
                        )
                    }
                },
                confirmButton = {
                    Button(onClick = {
                        val found = products.firstOrNull {
                            it.barcode.isNotBlank() && it.barcode == barcodeQuery.trim()
                        }
                        if (found == null || found.stock <= 0) {
                            message = "Aucun produit disponible pour ce code-barres."
                        } else {
                            val existing = cart.find { it.first.id == found.id }
                            cart = if (existing == null) cart + (found to 1) else cart.map {
                                if (it.first.id == found.id && it.second < found.stock)
                                    it.first to (it.second + 1)
                                else it
                            }
                            search = found.name
                            message = "${found.name} ajouté au panier."
                            showScannerDialog = false
                        }
                    }) { Text("Rechercher") }
                },
                dismissButton = {
                    TextButton(onClick = { showScannerDialog = false }) {
                        Text("Annuler")
                    }
                }
            )
        }

        message?.let { msg ->
            Spacer(Modifier.height(10.dp))
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF4F7))) {
                Text(msg, Modifier.padding(12.dp), color = BusinessInk, fontSize = 13.sp)
            }
        }
        Spacer(Modifier.height(18.dp))
    }
}

@Composable
private fun SummaryCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier.fillMaxWidth().padding(bottom = 8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, BusinessBorder)
    ) {
        Column(Modifier.padding(11.dp)) {
            Text(label, color = BusinessMuted, fontSize = 11.sp)
            Spacer(Modifier.height(4.dp))
            Text(value, color = BusinessInk, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun SectionTitle(value: String) {
    Spacer(Modifier.height(10.dp))
    Text(value, color = BusinessInk, fontSize = 16.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(6.dp))
}

@Composable
private fun PrimaryAction(label: String, onClick: () -> Unit) {
    Spacer(Modifier.height(10.dp))
    Button(
        onClick = onClick, modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = BusinessBlue)
    ) {
        Icon(Icons.Default.Add, contentDescription = null)
        Spacer(Modifier.width(6.dp))
        Text(label)
    }
}

@Composable
private fun RecordList(records: List<BRecord>) {
    if (records.isEmpty()) {
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            border = BorderStroke(1.dp, BusinessBorder)
        ) {
            Text("Aucun enregistrement pour le moment.", Modifier.padding(14.dp),
                color = BusinessMuted, fontSize = 12.sp)
        }
    } else {
        records.forEach { record ->
            Card(
                Modifier.fillMaxWidth().padding(bottom = 8.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, BusinessBorder)
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(11.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(record.title, color = BusinessInk, fontWeight = FontWeight.Bold)
                        Text(record.subtitle, color = BusinessMuted, fontSize = 12.sp)
                        Text(
                            java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRANCE)
                                .format(java.util.Date(record.date)),
                            color = BusinessMuted, fontSize = 10.sp
                        )
                    }
                    Text(businessMoney(record.amount), color = BusinessBlue,
                        fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
    }
}
