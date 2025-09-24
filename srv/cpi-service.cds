service CPIService {
    action sendToCX(payload : LargeString, environment : String) returns { result : String; };
    action sendToNewCX(payload : LargeString, environment : String) returns { result : String; };
}