import React, { Component } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  ImageBackground,
  Image,
  Alert,
  ToastAndroid,
  KeyboardAvoidingView
} from "react-native";
import * as Permissions from "expo-permissions";
import { BarCodeScanner } from "expo-barcode-scanner";
import db from "../config";
import firebase from "firebase";

const bgImage = require("../assets/background2.png");
const appIcon = require("../assets/appIcon.png");
const appName = require("../assets/appName.png");

export default class TransactionScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      bookId: "",
      studentId: "",
      domState: "normal",
      hasCameraPermissions: null,
      scanned: false,
      bookName: "",
      studentName: ""
    };
  }

  getCameraPermissions = async domState => {
    const { status } = await Permissions.askAsync(Permissions.CAMERA);

    this.setState({
      /*status === "concedido" es verdadero cuando el usuario ha concedido permiso
          status === "concedido" es falso cuando el usuario no ha concedido el permiso
        */
      hasCameraPermissions: status === "concedido",
      domState: domState,
      scanned: false
    });
  };

  handleBarCodeScanned = async ({ type, data }) => {
    const { domState } = this.state;

    if (domState === "Idlibro") {
      this.setState({
        bookId: data,
        domState: "normal",
        scanned: true
      });
    } else if (domState === "Idalumno") {
      this.setState({
        studentId: data,
        domState: "normal",
        scanned: true
      });
    }
  };

  handleTransaction = async () => {
    var { bookId, studentId } = this.state;
    await this.getBookDetails(bookId);
    await this.getStudentDetails(studentId);

    var transactionType = await this.checkBookAvailability(bookId);
    
         if (!transactionType) {
      this.setState({ bookId: "", studentId: "" });
      // Solo para usuarios de android
      // ToastAndroid.show("¡El libro no existe en la base de datos de la libreria!", ToastAndroid.SHORT);
      Alert.alert("¡El libro no existe en la base de datos de la biblioteca!");
    } 
    else if (transactionType === "issue") {
           var isEligible = await this.checkStudentEligibilityForBookIssue(
        studentId
      );

      if (isEligible) {
        var { bookName, studentName } = this.state;
        this.initiateBookIssue(bookId, studentId, bookName, studentName);
        // Solo para usuarios de android
      // ToastAndroid.show("¡Libro expedido al alumno!", ToastAndroid.SHORT);
      Alert.alert("¡Libro expedido al alumno!");
      }
      
        } else {
         var isEligible = await this.checkStudentEligibilityForBookReturn(
        bookId,
        studentId
      );

      if (isEligible) {
        var { bookName, studentName } = this.state;
        this.initiateBookReturn(bookId, studentId, bookName, studentName);
        
       // Solo para usuarios de android
       // ToastAndroid.show("¡El libro ha sido devueldo a la biblioteca!", ToastAndroid.SHORT);
       Alert.alert("¡El libro ha sido devueldo a la biblioteca!");
      }
    }
      
  };

  getBookDetails = bookId => {
    bookId = bookId.trim();
    db.collection("libros")
      .where("libro_id", "==", bookId)
      .get()
      .then(snapshot => {
        snapshot.docs.map(doc => {
          this.setState({
            bookName: doc.data().book_details.book_name
          });
        });
      });
  };

  getStudentDetails = studentId => {
    studentId = studentId.trim();
    db.collection("alumnos")
      .where("alumno_id", "==", studentId)
      .get()
      .then(snapshot => {
        snapshot.docs.map(doc => {
          this.setState({
            studentName: doc.data().student_details.student_name
          });
        });
      });
  };

  checkBookAvailability = async bookId => {
    const bookRef = await db
      .collection("libros")
      .where("libro_id", "==", bookId)
      .get();

    var transactionType = "";
    if (bookRef.docs.length == 0) {
      transactionType = false;
    } else {
      bookRef.docs.map(doc => {
        //si el libro está disponible, se emitirá el tipo de transacción
        // de lo contrario será de vuelta
        transactionType = doc.data().is_book_available ? "issue" : "return";
      });
    }

    return transactionType;
  };
  
  checkStudentEligibilityForBookIssue = async studentId => {
    const studentRef = await db
      .collection("alumnos")
      .where("alumno_id", "==", studentId)
      .get();

    var isStudentEligible = "";
    if (studentRef.docs.length == 0) {
      this.setState({
        bookId: "",
        studentId: ""
      });
      isStudentEligible = false;
      Alert.alert("¡La identificación del alimno no existe en la base de datos!");
    } else {
      studentRef.docs.map(doc => {
        if (doc.data().number_of_books_issued < 5) {
          isStudentEligible = true;
        } else {
          isStudentEligible = false;
          Alert.alert("La alumno no puede recibir más de 5 libros.");
          this.setState({
            bookId: "",
            studentId: ""
          });
        }
      });
    }

    return isStudentEligible;
  };
  
  
 checkStudentEligibilityForBookReturn = async (bookId, studentId) => {
    const transactionRef = await db
      .collection("transacciones")
      .where("libro_id", "==", bookId)
      .limit(1)
      .get();
    var isStudentEligible = "";
    transactionRef.docs.map(doc => {
      var lastBookTransaction = doc.data();
      if (lastBookTransaction.student_id === studentId) {
        isStudentEligible = true;
      } else {
        isStudentEligible = false;
        Alert.alert("El libro no fue publicado por el alumno!");
        this.setState({
          bookId: "",
          studentId: ""
        });
      }
    });
    return isStudentEligible;
  };
  
  
  
  initiateBookIssue = async (bookId, studentId, bookName, studentName) => {
    //añade una transacción
    db.collection("transacción").add({
      student_id: studentId,
      student_name: studentName,
      book_id: bookId,
      book_name: bookName,
      date: firebase.firestore.Timestamp.now().toDate(),
      transaction_type: "issue"
    });
    //cambia el estatus de libros
    db.collection("libros")
      .doc(bookId)
      .update({
        is_book_available: false
      });
    //cambia el numero de libros emitidos por el alumno
    db.collection("alumnos")
      .doc(studentId)
      .update({
        number_of_books_issued: firebase.firestore.FieldValue.increment(1)
      });

    // actualiza el estado local
    this.setState({
      bookId: "",
      studentId: ""
    });
  };

  initiateBookReturn = async (bookId, studentId, bookName, studentName) => {
    //añade una transacción
    db.collection("transaccioón").add({
      student_id: studentId,
      student_name: studentName,
      book_id: bookId,
      book_name: bookName,
      date: firebase.firestore.Timestamp.now().toDate(),
      transaction_type: "return"
    });
    //cambia el estatus de libros
    db.collection("libros")
      .doc(bookId)
      .update({
        is_book_available: true
      });
    //cambia el numero de libros emitidos por el alumno
    db.collection("alumnos")
      .doc(studentId)
      .update({
        number_of_books_issued: firebase.firestore.FieldValue.increment(-1)
      });

    // actualiza el estado local
    this.setState({
      bookId: "",
      studentId: ""
    });
  };

  render() {
    const { bookId, studentId, domState, scanned } = this.state;
    if (domState !== "normal") {
      return (
        <BarCodeScanner
          onBarCodeScanned={scanned ? undefined : this.handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
      );
    }
    return (
        <ImageBackground source={bgImage} style={styles.bgImage}>
          <View style={styles.upperContainer}>
            <Image source={appIcon} style={styles.appIcon} />
            <Image source={appName} style={styles.appName} />
          </View>
          <View style={styles.lowerContainer}>
            <View style={styles.textinputContainer}>
              <TextInput
                style={styles.textinput}
                placeholder={"Idlibro"}
                placeholderTextColor={"#FFFFFF"}
                value={bookId}
                onChangeText={text => this.setState({ bookId: text })}
              />
              <TouchableOpacity
                style={styles.scanbutton}
                onPress={() => this.getCameraPermissions("Idlibro")}
              >
                <Text style={styles.scanbuttonText}>Escanear</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.textinputContainer, { marginTop: 25 }]}>
              <TextInput
                style={styles.textinput}
                placeholder={"Id alumno"}
                placeholderTextColor={"#FFFFFF"}
                value={studentId}
                onChangeText={text => this.setState({ studentId: text })}
              />
              <TouchableOpacity
                style={styles.scanbutton}
                onPress={() => this.getCameraPermissions("sId alumno")}
              >
                <Text style={styles.scanbuttonText}>Scan</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.button, { marginTop: 25 }]}
              onPress={this.handleTransaction}
            >
              <Text style={styles.buttonText}>Entregar</Text>
            </TouchableOpacity>
          </View>
        </ImageBackground>
     
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF"
  },
  bgImage: {
    flex: 1,
    resizeMode: "cover",
    justifyContent: "center"
  },
  upperContainer: {
    flex: 0.5,
    justifyContent: "center",
    alignItems: "center"
  },
  appIcon: {
    width: 200,
    height: 200,
    resizeMode: "contain",
    marginTop: 80
  },
  appName: {
    width: 80,
    height: 80,
    resizeMode: "contain"
  },
  lowerContainer: {
    flex: 0.5,
    alignItems: "center"
  },
  textinputContainer: {
    borderWidth: 2,
    borderRadius: 10,
    flexDirection: "row",
    backgroundColor: "#9DFD24",
    borderColor: "#FFFFFF"
  },
  textinput: {
    width: "57%",
    height: 50,
    padding: 10,
    borderColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 3,
    fontSize: 18,
    backgroundColor: "#5653D4",
    
    color: "#FFFFFF"
  },
  scanbutton: {
    width: 100,
    height: 50,
    backgroundColor: "#9DFD24",
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    justifyContent: "center",
    alignItems: "center"
  },
  scanbuttonText: {
    fontSize: 24,
    color: "#0A0101",
  },
  button: {
    width: "43%",
    height: 55,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F48D20",
    borderRadius: 15
  },
  buttonText: {
    fontSize: 24,
    color: "#FFFFFF",
  }
});
