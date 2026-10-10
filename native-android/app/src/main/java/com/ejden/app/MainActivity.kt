package com.ejden.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ejden.app.ui.theme.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            var darkMode by remember { mutableStateOf(true) }

            MaterialTheme(
                colorScheme = if (darkMode) {
                    darkColorScheme(
                        primary = EjdenBlue,
                        secondary = EjdenLightBlue,
                        background = Color(0xFF10191D),
                        surface = Color(0xFF19252A),
                        onBackground = Color(0xFFF4F7F8),
                        onSurface = Color(0xFFF4F7F8)
                    )
                } else {
                    lightColorScheme(
                        primary = EjdenBlue,
                        secondary = EjdenDarkBlue,
                        background = EjdenBackground,
                        surface = EjdenSurface,
                        onBackground = EjdenText,
                        onSurface = EjdenText
                    )
                }
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    EjdenApp(
                        darkMode = darkMode,
                        onThemeChange = { darkMode = it }
                    )
                }
            }
        }
    }
}

@Composable
private fun EjdenApp(
    darkMode: Boolean,
    onThemeChange: (Boolean) -> Unit
) {
    var showDashboard by remember { mutableStateOf(false) }

    if (showDashboard) {
        DashboardScreen(
            darkMode = darkMode,
            onThemeChange = onThemeChange
        )
    } else {
        WelcomeScreen(onContinue = { showDashboard = true })
    }
}

@Composable
private fun WelcomeScreen(onContinue: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 26.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(94.dp)
                .background(EjdenBlue, RoundedCornerShape(28.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "E",
                color = Color.White,
                fontSize = 52.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "EJDEN",
            fontSize = 32.sp,
            fontWeight = FontWeight.ExtraBold,
            color = MaterialTheme.colorScheme.onBackground,
            letterSpacing = 2.sp
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "Votre espace EJDEN est prêt.",
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(10.dp))

        Text(
            text = "Commencez à enregistrer vos produits, vos ventes et vos clients.",
            fontSize = 15.sp,
            lineHeight = 23.sp,
            color = EjdenSecondaryText,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(26.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FeatureChip(
                text = "Produits",
                modifier = Modifier.weight(1f)
            )
            FeatureChip(
                text = "Ventes",
                modifier = Modifier.weight(1f)
            )
            FeatureChip(
                text = "Clients",
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.height(30.dp))

        Button(
            onClick = onContinue,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = EjdenBlue
            )
        ) {
            Text(
                text = "Accéder à mon espace",
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.size(8.dp))
            Icon(
                imageVector = Icons.Default.ArrowForward,
                contentDescription = null
            )
        }

        Spacer(modifier = Modifier.height(18.dp))

        Text(
            text = "Gestion simple • Espace professionnel",
            color = EjdenSecondaryText,
            fontSize = 12.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun FeatureChip(
    text: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        color = EjdenLightBlue,
        shape = RoundedCornerShape(12.dp)
    ) {
        Text(
            text = text,
            color = EjdenDarkBlue,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(
                horizontal = 5.dp,
                vertical = 12.dp
            )
        )
    }
}

@Composable
private fun DashboardScreen(
    darkMode: Boolean,
    onThemeChange: (Boolean) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "EJDEN",
                    fontSize = 27.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = EjdenBlue
                )
                Text(
                    text = "Tableau de bord",
                    color = MaterialTheme.colorScheme.onBackground
                )
            }

            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = CircleShape
            ) {
                Icon(
                    imageVector = Icons.Default.Settings,
                    contentDescription = "Paramètres",
                    modifier = Modifier.padding(12.dp),
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Bienvenue sur EJDEN",
            fontSize = 23.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "La base native est en place. Les modules métier seront migrés progressivement.",
            color = EjdenSecondaryText,
            lineHeight = 22.sp
        )

        Spacer(modifier = Modifier.height(22.dp))

        ModuleCard(
            title = "Produits et stock",
            description = "Catalogue, quantités et mouvements de stock",
            icon = { Icon(Icons.Default.Inventory2, null) }
        )

        ModuleCard(
            title = "Ventes et caisse",
            description = "Ventes, paiements et suivi de caisse",
            icon = { Icon(Icons.Default.PointOfSale, null) }
        )

        ModuleCard(
            title = "Clients",
            description = "Fichier clients et suivi des crédits",
            icon = { Icon(Icons.Default.People, null) }
        )

        ModuleCard(
            title = "Rapports et statistiques",
            description = "Indicateurs et résultats de l'activité",
            icon = { Icon(Icons.Default.Assessment, null) }
        )

        Spacer(modifier = Modifier.height(18.dp))

        Button(
            onClick = { onThemeChange(!darkMode) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = EjdenBlue
            )
        ) {
            Text(
                if (darkMode) "Activer le thème clair"
                else "Activer le thème sombre"
            )
        }

        Spacer(modifier = Modifier.height(18.dp))

        Text(
            text = "Version native initiale — modules en cours de migration",
            color = EjdenSecondaryText,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun ModuleCard(
    title: String,
    description: String,
    icon: @Composable () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 12.dp),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                color = EjdenLightBlue,
                shape = RoundedCornerShape(14.dp)
            ) {
                Box(
                    modifier = Modifier.size(48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CompositionLocalProvider(
                        androidx.compose.material3.LocalContentColor provides EjdenDarkBlue
                    ) {
                        icon()
                    }
                }
            }

            Spacer(modifier = Modifier.size(14.dp))

            Column {
                Text(
                    text = title,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = description,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    color = EjdenSecondaryText
                )
            }
        }
    }
}
