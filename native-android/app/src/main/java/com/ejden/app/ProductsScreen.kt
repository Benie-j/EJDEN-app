package com.ejden.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class EjdenProduct(
    val id: Long = 0,
    val name: String,
    val category: String,
    val purchase: Long,
    val sale: Long,
    val stock: Int,
    val threshold: Int,
    val barcode: String
) {
    val status: String
        get() = when {
            stock == 0 -> "Rupture"
            stock <= threshold -> "Stock faible"
            else -> "En stock"
        }
}

private class EjdenProductsDb(context: Context) :
    SQLiteOpenHelper(context, "ejden_products.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE products (
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
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun products(): List<EjdenProduct> {
        val result = mutableListOf<EjdenProduct>()
        readableDatabase.query(
            "products", null, null, null, null, null, "name COLLATE NOCASE"
        ).use { c ->
            while (c.moveToNext()) {
                result += EjdenProduct(
                    id = c.getLong(c.getColumnIndexOrThrow("id")),
                    name = c.getString(c.getColumnIndexOrThrow("name")),
                    category = c.getString(c.getColumnIndexOrThrow("category")),
                    purchase = c.getLong(c.getColumnIndexOrThrow("purchase_price")),
                    sale = c.getLong(c.getColumnIndexOrThrow("sale_price")),
                    stock = c.getInt(c.getColumnIndexOrThrow("stock")),
                    threshold = c.getInt(c.getColumnIndexOrThrow("threshold")),
                    barcode = c.getString(c.getColumnIndexOrThrow("barcode"))
                )
            }
        }
        return result
    }

    fun save(p: EjdenProduct): String? {
        if (p.barcode.isNotBlank()) {
            readableDatabase.query(
                "products", arrayOf("id"), "barcode = ? AND id != ?",
                arrayOf(p.barcode, p.id.toString()), null, null, null
            ).use {
                if (it.moveToFirst()) return "Ce code-barres est déjà utilisé."
            }
        }
        val values = ContentValues().apply {
            put("name", p.name.trim())
            put("category", p.category.trim())
            put("purchase_price", p.purchase)
            put("sale_price", p.sale)
            put("stock", p.stock)
            put("threshold", p.threshold)
            put("barcode", p.barcode.trim())
        }
        if (p.id == 0L) writableDatabase.insertOrThrow("products", null, values)
        else writableDatabase.update("products", values, "id = ?", arrayOf(p.id.toString()))
        return null
    }

    fun delete(id: Long) {
        writableDatabase.delete("products", "id = ?", arrayOf(id.toString()))
    }
}

@Composable
internal fun ProductsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val db = remember { EjdenProductsDb(context.applicationContext) }
    var products by remember { mutableStateOf(emptyList<EjdenProduct>()) }
    var search by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("Tous") }
    var editing by remember { mutableStateOf<EjdenProduct?>(null) }
    var formOpen by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<EjdenProduct?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }

    val blue = Color(0xFF176B87)
    val page = Color(0xFFF5F7F8)
    val ink = Color(0xFF172126)
    val muted = Color(0xFF68777D)
    val border = Color(0xFFE2E8EA)

    fun refresh() { products = db.products() }
    LaunchedEffect(Unit) { refresh() }

    val visible = products.filter { p ->
        val queryMatch = p.name.contains(search, true) ||
            p.category.contains(search, true) || p.barcode.contains(search, true)
        val filterMatch = when (filter) {
            "En stock" -> p.stock > p.threshold && p.stock > 0
            "Stock faible" -> p.stock > 0 && p.stock <= p.threshold
            "Rupture" -> p.stock == 0
            else -> true
        }
        queryMatch && filterMatch
    }

    Column(Modifier.fillMaxSize().background(page)) {
        Row(
            Modifier.fillMaxWidth().background(Color.White).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, "Retour", tint = ink)
            }
            Column(Modifier.weight(1f)) {
                Text("GESTION", color = blue, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text("Produits", color = ink, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
            }
            IconButton(onClick = { editing = null; formOpen = true }) {
                Icon(Icons.Default.Add, "Ajouter un produit", tint = blue)
            }
        }

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState())
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Summary("Produits", products.size.toString(), blue, Modifier.weight(1f))
                Summary("Stock faible", products.count {
                    it.stock > 0 && it.stock <= it.threshold
                }.toString(), Color(0xFFD98A16), Modifier.weight(1f))
                Summary("Ruptures", products.count {
                    it.stock == 0
                }.toString(), Color(0xFFD64545), Modifier.weight(1f))
            }

            OutlinedTextField(
                value = search, onValueChange = { search = it },
                modifier = Modifier.fillMaxWidth(), singleLine = true,
                shape = RoundedCornerShape(12.dp),
                placeholder = { Text("Rechercher un produit…") },
                leadingIcon = { Icon(Icons.Default.Search, null) }
            )

            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                listOf("Tous", "En stock", "Stock faible", "Rupture").forEach { f ->
                    val selected = f == filter
                    Surface(
                        modifier = Modifier.weight(1f).clickable { filter = f },
                        shape = RoundedCornerShape(9.dp),
                        color = if (selected) blue else Color.White,
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp, if (selected) blue else border
                        )
                    ) {
                        Text(
                            f, Modifier.padding(vertical = 9.dp, horizontal = 2.dp)
                                .fillMaxWidth(),
                            textAlign = TextAlign.Center,
                            color = if (selected) Color.White else muted,
                            fontSize = 9.sp, maxLines = 2
                        )
                    }
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Mes produits", color = ink, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text("${visible.size} produit(s)", color = muted, fontSize = 12.sp)
                }
                Button(
                    onClick = { editing = null; formOpen = true },
                    colors = ButtonDefaults.buttonColors(containerColor = blue)
                ) {
                    Icon(Icons.Default.Add, null, modifier = Modifier.size(17.dp))
                    Text("Ajouter")
                }
            }

            if (visible.isEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = androidx.compose.foundation.BorderStroke(1.dp, border)
                ) {
                    Column(
                        Modifier.fillMaxWidth().padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.Inventory2, null, tint = blue, modifier = Modifier.size(42.dp))
                        Spacer(Modifier.height(10.dp))
                        Text(
                            if (products.isEmpty()) "Aucun produit" else "Aucun résultat",
                            color = ink, fontSize = 17.sp, fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.height(5.dp))
                        Text(
                            if (products.isEmpty())
                                "Ajoutez votre premier produit pour commencer à gérer votre stock."
                            else "Aucun produit ne correspond à la recherche ou au filtre.",
                            color = muted, textAlign = TextAlign.Center, fontSize = 12.sp
                        )
                        if (products.isEmpty()) {
                            Spacer(Modifier.height(12.dp))
                            Button(
                                onClick = { editing = null; formOpen = true },
                                colors = ButtonDefaults.buttonColors(containerColor = blue)
                            ) { Text("Ajouter un produit") }
                        }
                    }
                }
            } else {
                visible.forEach { p ->
                    val statusColor = when (p.status) {
                        "Rupture" -> Color(0xFFD64545)
                        "Stock faible" -> Color(0xFFD98A16)
                        else -> Color(0xFF168A5B)
                    }
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = androidx.compose.foundation.BorderStroke(1.dp, border)
                    ) {
                        Column(Modifier.padding(13.dp)) {
                            Row(verticalAlignment = Alignment.Top) {
                                Icon(Icons.Default.Inventory2, null, tint = blue, modifier = Modifier.padding(5.dp).size(28.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(p.name, color = ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text(p.category.ifBlank { "Sans catégorie" }, color = muted, fontSize = 11.sp)
                                    Text(p.status, color = statusColor, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                                IconButton(onClick = { editing = p; formOpen = true }) {
                                    Icon(Icons.Default.Edit, "Modifier", tint = blue)
                                }
                                IconButton(onClick = { deleting = p }) {
                                    Icon(Icons.Default.Delete, "Supprimer", tint = Color(0xFFD64545))
                                }
                            }
                            HorizontalDivider(color = border)
                            Spacer(Modifier.height(8.dp))
                            Text("Prix de vente : ${p.sale} FCFA", color = ink, fontSize = 12.sp)
                            Text("Stock : ${p.stock}    •    Seuil d'alerte : ${p.threshold}", color = muted, fontSize = 12.sp)
                            if (p.barcode.isNotBlank()) Text("Code-barres : ${p.barcode}", color = muted, fontSize = 11.sp)
                        }
                    }
                }
            }
            notice?.let { Text(it, color = Color(0xFFD64545), fontSize = 12.sp) }
        }
    }

    if (formOpen) {
        ProductDialog(
            initial = editing,
            onClose = { formOpen = false },
            onSave = { name, category, purchase, sale, stock, threshold, barcode ->
                if (name.isBlank()) {
                    notice = "Le nom du produit est obligatoire."
                    false
                } else {
                    val error = db.save(
                        EjdenProduct(
                            id = editing?.id ?: 0L, name = name,
                            category = category, purchase = purchase,
                            sale = sale, stock = stock, threshold = threshold,
                            barcode = barcode
                        )
                    )
                    if (error != null) {
                        notice = error
                        false
                    } else {
                        notice = null
                        refresh()
                        formOpen = false
                        true
                    }
                }
            }
        )
    }

    deleting?.let { p ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("Supprimer le produit ?") },
            text = { Text("« ${p.name} » sera supprimé de la base locale.") },
            confirmButton = {
                TextButton(onClick = {
                    db.delete(p.id)
                    deleting = null
                    refresh()
                }) { Text("Supprimer", color = Color(0xFFD64545)) }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Annuler") } }
        )
    }
}

@Composable
private fun Summary(label: String, value: String, accent: Color, modifier: Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE2E8EA))
    ) {
        Column(Modifier.padding(8.dp)) {
            Text(label, color = Color(0xFF68777D), fontSize = 9.sp, minLines = 2)
            Text(value, color = accent, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun ProductDialog(
    initial: EjdenProduct?,
    onClose: () -> Unit,
    onSave: (String, String, Long, Long, Int, Int, String) -> Boolean
) {
    var name by remember(initial?.id) { mutableStateOf(initial?.name ?: "") }
    var category by remember(initial?.id) { mutableStateOf(initial?.category ?: "") }
    var purchase by remember(initial?.id) { mutableStateOf(initial?.purchase?.toString() ?: "") }
    var sale by remember(initial?.id) { mutableStateOf(initial?.sale?.toString() ?: "") }
    var stock by remember(initial?.id) { mutableStateOf(initial?.stock?.toString() ?: "0") }
    var threshold by remember(initial?.id) { mutableStateOf(initial?.threshold?.toString() ?: "0") }
    var barcode by remember(initial?.id) { mutableStateOf(initial?.barcode ?: "") }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(if (initial == null) "Ajouter un produit" else "Modifier le produit") },
        text = {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 450.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nom du produit *") }, singleLine = true)
                OutlinedTextField(category, { if (it.length <= 40) category = it }, Modifier.fillMaxWidth(), label = { Text("Catégorie") }, singleLine = true)
                OutlinedTextField(purchase, { purchase = it }, Modifier.fillMaxWidth(), label = { Text("Prix d'achat (FCFA) *") }, singleLine = true)
                OutlinedTextField(sale, { sale = it }, Modifier.fillMaxWidth(), label = { Text("Prix de vente (FCFA) *") }, singleLine = true)
                OutlinedTextField(stock, { stock = it }, Modifier.fillMaxWidth(), label = { Text("Stock initial *") }, singleLine = true)
                OutlinedTextField(threshold, { threshold = it }, Modifier.fillMaxWidth(), label = { Text("Seuil d'alerte") }, singleLine = true)
                OutlinedTextField(barcode, { barcode = it }, Modifier.fillMaxWidth(), label = { Text("Code-barres (facultatif)") }, singleLine = true)
                error?.let { Text(it, color = Color(0xFFD64545), fontSize = 12.sp) }
                Text("* Champs obligatoires. Prix en FCFA.", color = Color(0xFF68777D), fontSize = 10.sp)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val a = purchase.toLongOrNull()
                val b = sale.toLongOrNull()
                val c = stock.toIntOrNull()
                val d = threshold.toIntOrNull() ?: 0
                error = when {
                    name.isBlank() -> "Le nom du produit est obligatoire."
                    a == null || a < 0 -> "Prix d'achat invalide."
                    b == null || b <= 0 -> "Le prix de vente doit être supérieur à zéro."
                    c == null || c < 0 -> "Stock invalide."
                    d < 0 -> "Seuil invalide."
                    else -> null
                }
                if (error == null && onSave(name, category, a!!, b!!, c!!, d, barcode)) onClose()
                else if (error == null) error = "Vérifiez les informations et le code-barres."
            }) { Text("Enregistrer") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Annuler") } }
    )
}
